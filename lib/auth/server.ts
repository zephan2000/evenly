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

export async function upsertUserOnFirstSeen(input: UpsertUserInput): Promise<{ id: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .upsert(
      {
        clerk_user_id: input.clerkUserId,
        email: input.email ?? null,
        display_name: input.displayName ?? null,
      },
      { onConflict: 'clerk_user_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) throw new Error(`upsertUserOnFirstSeen failed: ${error.message}`);
  return { id: data.id };
}
