// POST /api/upload — multipart upload of a receipt image to Supabase Storage.
// Path convention: receipts/{trip_id}/{uuid}.{ext}.
//
// Auth + ownership model: server-side enforced.
//   1. Validate the Clerk JWT and resolve the caller's public.users.id.
//   2. Confirm the caller owns the target trip via the user-scoped client
//      (PostgREST RLS on public.trips returns the row only if the caller
//      owns it, so a successful single() = ownership confirmed).
//   3. Perform the actual storage.upload via the service-role admin client.
//
// Why not rely on storage.objects RLS? Supabase Storage's JWT validation
// pipeline does not currently honor Third-Party Auth (Clerk-signed RS256
// tokens validated via Clerk's JWKS) — uploads under TPA fail with
// `new row violates row-level security policy` even when the equivalent
// PostgREST query against public.trips passes. Database RLS on trips/users
// is unaffected. Storage RLS policies remain in place as defense-in-depth
// for any future direct-from-client uploads, but this route now performs
// the authoritative ownership check itself.

import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '../lib/auth/server';
import { createAdminClient, createUserClient } from '../lib/db/server';

const MAX_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) {
    return Response.json({ ok: false, error: 'invalid_jwt' }, { status: 401 });
  }

  // Ensure the public.users row exists so trips RLS can resolve the caller.
  // First-request idempotent; cheap on subsequent requests.
  const { id: userId } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  // RN's ambient FormData lacks `get` (it's a write-only upload body type),
  // but at runtime in the Node server context Request.formData() returns the
  // Web standard FormData with `get`. Cast to a minimal structural shape.
  type WebForm = { get(name: string): string | Blob | null };
  const form = (await request.formData().catch(() => null)) as WebForm | null;
  if (!form) {
    return Response.json({ ok: false, error: 'invalid_form_data' }, { status: 400 });
  }

  const tripId = form.get('trip_id');
  const file = form.get('file');

  if (typeof tripId !== 'string' || !UUID_RE.test(tripId)) {
    return Response.json({ ok: false, error: 'trip_id_required' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'file_required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return Response.json({ ok: false, error: 'image_required' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large', limit: MAX_BYTES }, { status: 413 });
  }

  // Ownership check: the user-scoped client only returns trips the caller
  // owns (per public.trips_select_owner RLS). A failed single() = the
  // trip doesn't exist OR the caller doesn't own it. Both are 403.
  const userClient = createUserClient(auth.jwt);
  const { data: trip, error: tripErr } = await userClient
    .from('trips')
    .select('id, owner_user_id')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();

  if (tripErr) {
    return Response.json(
      { ok: false, error: 'ownership_check_failed', detail: tripErr.message },
      { status: 500 },
    );
  }
  if (!trip || trip.owner_user_id !== userId) {
    return Response.json({ ok: false, error: 'forbidden_trip' }, { status: 403 });
  }

  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'bin';
  const key = `${tripId}/${crypto.randomUUID()}.${ext}`;

  // Admin client for the actual upload — bypasses storage.objects RLS,
  // which under TPA rejects authenticated Clerk tokens. Ownership has
  // already been verified above, so this is safe.
  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from('receipts').upload(key, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return Response.json(
      { ok: false, error: 'upload_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, path: key }, { status: 200 });
}
