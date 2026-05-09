// POST /api/extract — fetches a receipt image from Supabase Storage by path,
// runs it through the AI extractor, returns the parsed PersistedExpense.
// Does NOT persist; the user edits the returned data and POSTs to /api/expenses.
//
// Auth + ownership model: same shape as /api/upload. The Storage download
// runs through the service-role admin client because Supabase Storage
// RLS doesn't currently honor Third-Party Auth (Clerk-signed JWTs).
// Ownership is enforced server-side: we parse the trip_id out of the
// path's first folder segment and verify the caller owns that trip via
// PostgREST (which honors trips RLS correctly).

import { extractReceipt } from '@/lib/ai/extract';
import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '@/lib/auth/server';
import { createAdminClient, createUserClient } from '@/lib/db/server';

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

  const { id: userId } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const path = (body as { receipt_path?: unknown })?.receipt_path;
  if (typeof path !== 'string' || !path.includes('/')) {
    return Response.json({ ok: false, error: 'receipt_path_required' }, { status: 400 });
  }

  // First folder segment is the trip id (path convention from /api/upload).
  const tripId = path.split('/')[0];
  if (!UUID_RE.test(tripId)) {
    return Response.json({ ok: false, error: 'invalid_path' }, { status: 400 });
  }

  // Ownership check via PostgREST (RLS-respecting).
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

  // Admin client bypasses Storage RLS; ownership has been verified above.
  const adminClient = createAdminClient();
  const { data: blob, error: dlError } = await adminClient.storage.from('receipts').download(path);
  if (dlError || !blob) {
    return Response.json(
      { ok: false, error: 'download_failed', detail: dlError?.message ?? 'no body' },
      { status: 404 },
    );
  }

  const arrayBuf = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mime = blob.type || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  const result = await extractReceipt({ imageDataUrl: dataUrl });
  if (!result.ok) {
    const status =
      result.error.kind === 'missing_api_key'
        ? 500
        : result.error.kind === 'provider_unavailable'
          ? 502
          : 422;
    return Response.json(result, { status });
  }
  return Response.json(result, { status: 200 });
}
