// GET   /api/me — the signed-in user's saved display name (null if unset).
// PATCH /api/me — set users.display_name, and propagate it to this user's
//                 existing trip_members rows (conflict-safe against the
//                 per-trip unique index trip_members_trip_display_name_idx).
//
// Auth: Clerk JWT via Authorization header. Server-only; relative imports
// (the @/ alias is not resolved by @vercel/node).

import { z } from 'zod';

import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '../lib/auth/server';
import { createAdminClient } from '../lib/db/server';

const DisplayNameSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
});

type Authed =
  | { ok: true; userId: string; displayName: string | null }
  | { ok: false; status: number; error: string };

async function authed(request: Request): Promise<Authed> {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) return { ok: false, status: 401, error: auth.error.kind };

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) return { ok: false, status: 401, error: 'invalid_jwt' };

  const { id, displayName } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });
  return { ok: true, userId: id, displayName };
}

export async function GET(request: Request) {
  const a = await authed(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  return Response.json({ ok: true, display_name: a.displayName }, { status: 200 });
}

export async function PATCH(request: Request) {
  const a = await authed(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = DisplayNameSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const name = parsed.data.display_name;
  const admin = createAdminClient();

  // 1. The global profile name (used as the fallback for future trips).
  const { error: userErr } = await admin
    .from('users')
    .update({ display_name: name })
    .eq('id', a.userId);
  if (userErr) {
    return Response.json(
      { ok: false, error: 'update_failed', detail: userErr.message },
      { status: 500 },
    );
  }

  // 2. Retroactively fix this user's per-trip member rows so existing trips
  //    (e.g. the live Bali trip showing "Owner") update too. Skip any trip
  //    where another member already holds this name — the unique index
  //    (trip_id, lower(display_name)) would reject it. Case-insensitive
  //    compare in JS to avoid LIKE-wildcard pitfalls.
  const { data: mine, error: mineErr } = await admin
    .from('trip_members')
    .select('id, trip_id')
    .eq('user_id', a.userId);
  if (mineErr) {
    return Response.json(
      { ok: false, error: 'members_read_failed', detail: mineErr.message },
      { status: 500 },
    );
  }

  const rows = mine ?? [];
  let updated = 0;
  let skipped = 0;

  if (rows.length > 0) {
    const tripIds = rows.map((r) => r.trip_id);
    const { data: others, error: othersErr } = await admin
      .from('trip_members')
      .select('trip_id, display_name')
      .in('trip_id', tripIds)
      .neq('user_id', a.userId);
    if (othersErr) {
      return Response.json(
        { ok: false, error: 'members_read_failed', detail: othersErr.message },
        { status: 500 },
      );
    }

    const lower = name.toLowerCase();
    const clashTrips = new Set(
      (others ?? []).filter((o) => o.display_name.toLowerCase() === lower).map((o) => o.trip_id),
    );
    const safeIds = rows.filter((r) => !clashTrips.has(r.trip_id)).map((r) => r.id);
    skipped = rows.length - safeIds.length;

    if (safeIds.length > 0) {
      const { error: bfErr } = await admin
        .from('trip_members')
        .update({ display_name: name })
        .in('id', safeIds);
      if (bfErr) {
        return Response.json(
          { ok: false, error: 'backfill_failed', detail: bfErr.message },
          { status: 500 },
        );
      }
      updated = safeIds.length;
    }
  }

  return Response.json(
    { ok: true, display_name: name, trips_updated: updated, trips_skipped: skipped },
    { status: 200 },
  );
}
