// Server-only auth helpers. Used by API route handlers.
// JWT signature verification is handled by Supabase's RLS layer (the Clerk
// "supabase" template signs with Supabase's JWT secret), so route handlers
// only need to extract the bearer token and let RLS enforce access.

import { createAdminClient } from '../db/server';

export type GetJwtError = { kind: 'missing_token' } | { kind: 'malformed_token' };

export function getJwtFromRequest(
  request: Request,
): { ok: true; jwt: string } | { ok: false; error: GetJwtError } {
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return { ok: false, error: { kind: 'missing_token' } };
  }
  const jwt = auth.slice(7).trim();
  if (!jwt || jwt.split('.').length !== 3) {
    return { ok: false, error: { kind: 'malformed_token' } };
  }
  return { ok: true, jwt };
}

type JwtClaims = { sub?: string; email?: string; name?: string };

// Decode (not verify). Supabase verifies signature; we only read claims for
// metadata propagation (e.g., upserting the users row on first sign-in).
export function decodeJwtClaims(jwt: string): JwtClaims | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
    return decoded;
  } catch {
    return null;
  }
}

export type UpsertUserInput = {
  clerkUserId: string;
  email?: string | null;
  displayName?: string | null;
};

// Seed-only on display_name: the name is owned by the user (Settings →
// PATCH /api/me). claims.name only *seeds* it on first creation or when still
// empty — we must never clobber a user-set name with null on a later request
// (Clerk JWTs here carry no `name` claim, so a blind upsert would wipe it).
// Returns the effective stored display_name so callers skip a re-read.
export async function upsertUserOnFirstSeen(
  input: UpsertUserInput,
): Promise<{ id: string; displayName: string | null }> {
  const admin = createAdminClient();

  const { data: existing, error: selErr } = await admin
    .from('users')
    .select('id, display_name')
    .eq('clerk_user_id', input.clerkUserId)
    .maybeSingle();
  if (selErr) throw new Error(`upsertUserOnFirstSeen select failed: ${selErr.message}`);

  if (existing) {
    const patch: { email: string | null; display_name?: string } = {
      email: input.email ?? null,
    };
    if (!existing.display_name && input.displayName) {
      patch.display_name = input.displayName;
    }
    const { data, error } = await admin
      .from('users')
      .update(patch)
      .eq('id', existing.id)
      .select('id, display_name')
      .single();
    if (error) throw new Error(`upsertUserOnFirstSeen update failed: ${error.message}`);
    return { id: data.id, displayName: data.display_name ?? null };
  }

  const { data, error } = await admin
    .from('users')
    .insert({
      clerk_user_id: input.clerkUserId,
      email: input.email ?? null,
      display_name: input.displayName ?? null,
    })
    .select('id, display_name')
    .single();
  if (error) throw new Error(`upsertUserOnFirstSeen insert failed: ${error.message}`);
  return { id: data.id, displayName: data.display_name ?? null };
}
