// Server-only Supabase clients. Do not import from client components.
// Two factories:
//   - createUserClient(jwt): RLS-respecting client carrying the caller's
//     Clerk-issued Supabase JWT. Use this for any per-request work.
//   - createAdminClient(): service-role client that bypasses RLS. Use only for
//     trusted server work (e.g., upserting users on first sign-in).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type Client = SupabaseClient<Database>;

// Env vars accessed by literal name so Expo's bundler can statically inline
// the EXPO_PUBLIC_* values at build time (expo/no-dynamic-env-var).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireUrl(): string {
  if (!SUPABASE_URL) throw new Error('Missing required env var: EXPO_PUBLIC_SUPABASE_URL');
  return SUPABASE_URL;
}
function requireAnonKey(): string {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing required env var: EXPO_PUBLIC_SUPABASE_KEY');
  return SUPABASE_ANON_KEY;
}
function requireServiceRoleKey(): string {
  if (!SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return SUPABASE_SERVICE_ROLE_KEY;
}

export function createUserClient(jwt: string): Client {
  return createClient<Database>(requireUrl(), requireAnonKey(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient(): Client {
  return createClient<Database>(requireUrl(), requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
