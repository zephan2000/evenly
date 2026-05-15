// /api/trips/[id]/members
//   GET  — list the members of a trip (anyone with access can read).
//   POST — add a new member by display name. Anonymous member (user_id
//          stays null until a real user claims it via share link, which
//          is post-MVP).
//
// Auth + ownership model mirrors the rest of /api/*: validate Clerk JWT,
// upsert public.users so RLS resolves, then query through createUserClient.
// trip_members_select_owner and trip_members_insert_owner gate access to
// trips the caller owns.

import { z } from 'zod';

import {
  decodeJwtClaims,
  getJwtFromRequest,
  upsertUserOnFirstSeen,
} from '../../../lib/auth/server';
import { createUserClient } from '../../../lib/db/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AddMemberSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
});

function extractTripId(request: Request): string | null {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // .../api/trips/{id}/members
  const idx = segments.indexOf('trips');
  if (idx < 0) return null;
  const candidate = segments[idx + 1];
  return candidate && UUID_RE.test(candidate) ? candidate : null;
}

async function authedUser(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) return { ok: false as const, status: 401, error: auth.error.kind };

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) return { ok: false as const, status: 401, error: 'invalid_jwt' };

  const { id } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  return { ok: true as const, jwt: auth.jwt, userId: id };
}

export async function GET(request: Request) {
  const a = await authedUser(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  const tripId = extractTripId(request);
  if (!tripId) return Response.json({ ok: false, error: 'invalid_trip_id' }, { status: 400 });

  const client = createUserClient(a.jwt);
  const { data, error } = await client
    .from('trip_members')
    .select('id, trip_id, user_id, display_name, joined_at, claimed_at')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  if (error) {
    return Response.json(
      { ok: false, error: 'list_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, members: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const a = await authedUser(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  const tripId = extractTripId(request);
  if (!tripId) return Response.json({ ok: false, error: 'invalid_trip_id' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Trip ownership is enforced by trip_members_insert_owner RLS: the policy
  // checks that the trips row for trip_id is owned by current_user_id().
  // We don't pre-fetch the trip; if the caller isn't the owner, the insert
  // will fail with 403 from PostgREST.
  //
  // trip_members_identity_check requires EXACTLY ONE of (user_id, anon_id)
  // to be set — owner rows fill user_id, guest rows fill anon_id. The
  // share-link claim flow (post-MVP) will swap a guest's anon_id for a
  // real user_id when they sign in. Until then, every member created
  // through this endpoint is a guest, so we mint an anon_id here.
  const client = createUserClient(a.jwt);
  const { data, error } = await client
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: null,
      anon_id: crypto.randomUUID(),
      display_name: parsed.data.display_name,
    })
    .select('id, trip_id, user_id, display_name, joined_at, claimed_at')
    .single();

  if (error) {
    // 23505 = unique violation. The (trip_id, lower(display_name)) unique
    // constraint enforces that same-name-in-same-trip = same person per
    // the trip_members schema. Surface a friendlier code so the UI can
    // show "Someone named X already exists in this trip."
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return Response.json(
        { ok: false, error: 'duplicate_name', detail: error.message },
        { status: 409 },
      );
    }
    return Response.json(
      { ok: false, error: 'add_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, member: data }, { status: 200 });
}
