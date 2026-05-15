// GET  /api/trips — list the current user's trips (owner-scoped).
// POST /api/trips — create a new trip + the owner's trip_member row.
//
// Auth: Clerk JWT via Authorization header. On every request we ensure the
// `users` row exists so RLS's current_user_id() resolves correctly.

import { z } from 'zod';

import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '../lib/auth/server';
import { createUserClient } from '../lib/db/server';

type JwtClaims = NonNullable<ReturnType<typeof decodeJwtClaims>>;

const ISO_4217 = /^[A-Z]{3}$/;

const CreateTripSchema = z.object({
  name: z.string().trim().min(1).max(100),
  home_currency: z.string().regex(ISO_4217, 'home_currency must be ISO 4217'),
  display_name: z.string().trim().min(1).max(80).optional(),
});

type AuthedUser = {
  ok: true;
  jwt: string;
  claims: JwtClaims;
  userId: string;
};
type AuthedFailure = {
  ok: false;
  status: number;
  error: string;
};

async function authedUser(request: Request): Promise<AuthedUser | AuthedFailure> {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) return { ok: false, status: 401, error: auth.error.kind };

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) return { ok: false, status: 401, error: 'invalid_jwt' };

  const { id } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  return { ok: true, jwt: auth.jwt, claims, userId: id };
}

export async function GET(request: Request) {
  const a = await authedUser(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  const client = createUserClient(a.jwt);
  const { data, error } = await client
    .from('trips')
    .select('id, name, home_currency, created_at, trip_members!inner(id, user_id)')
    .eq('trip_members.user_id', a.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json(
      { ok: false, error: 'list_failed', detail: error.message },
      { status: 500 },
    );
  }

  const trips = (data ?? [])
    .map((row) => {
      const member = Array.isArray(row.trip_members) ? row.trip_members[0] : null;
      if (!member) return null;
      return {
        id: row.id,
        name: row.name,
        home_currency: row.home_currency,
        owner_member_id: member.id,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return Response.json({ ok: true, trips }, { status: 200 });
}

export async function POST(request: Request) {
  const a = await authedUser(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = CreateTripSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const client = createUserClient(a.jwt);

  const { data: trip, error: tripErr } = await client
    .from('trips')
    .insert({
      name: parsed.data.name,
      home_currency: parsed.data.home_currency,
      owner_user_id: a.userId,
    })
    .select('id, name, home_currency')
    .single();

  if (tripErr || !trip) {
    return Response.json(
      { ok: false, error: 'create_failed', detail: tripErr?.message ?? 'no row' },
      { status: 500 },
    );
  }

  const fallbackName =
    parsed.data.display_name ?? a.claims.name ?? a.claims.email?.split('@')[0] ?? 'Owner';

  const { data: member, error: memberErr } = await client
    .from('trip_members')
    .insert({
      trip_id: trip.id,
      user_id: a.userId,
      display_name: fallbackName,
    })
    .select('id')
    .single();

  if (memberErr || !member) {
    // Trip exists without an owner member. Surface the error so the client can
    // retry; cleanup of orphan trips is handled by a periodic job (post-MVP).
    return Response.json(
      {
        ok: false,
        error: 'member_create_failed',
        detail: memberErr?.message ?? 'no row',
        orphan_trip_id: trip.id,
      },
      { status: 500 },
    );
  }

  return Response.json(
    {
      ok: true,
      trip: {
        id: trip.id,
        name: trip.name,
        home_currency: trip.home_currency,
        owner_member_id: member.id,
      },
    },
    { status: 200 },
  );
}
