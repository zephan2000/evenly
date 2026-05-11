// Client-side helpers for the /api/trips endpoint. Browser/native fetch.
//
// Returned shape carries everything the QC screen needs: trip id (for the
// upload path + saveContext.tripId) and the owner's trip_member id (for
// saveContext.payerMemberId / createdByMemberId).

import { addTripMember, type TripMember } from './trip-members';

export type TripRecord = {
  id: string;
  name: string;
  home_currency: string;
  owner_member_id: string;
};

export type CreateTripArgs = {
  name: string;
  home_currency: string;
  display_name?: string;
};

/**
 * Result of createTripWithMembers. `members` is the list of additional
 * members successfully added — note this excludes the owner row (already
 * created by POST /trips). `memberErrors` captures any names that failed
 * (e.g. duplicate within the trip); callers can surface them as warnings
 * without rolling back the trip itself.
 */
export type CreateTripWithMembersResult = {
  trip: TripRecord;
  members: TripMember[];
  memberErrors: { display_name: string; error: string }[];
};

export type GetToken = () => Promise<string | null>;

type ListResponse = { ok: true; trips: TripRecord[] } | { ok: false; error: string };
type CreateResponse = { ok: true; trip: TripRecord } | { ok: false; error: string };

export async function listTrips(getToken: GetToken, apiBase = ''): Promise<TripRecord[]> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as ListResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`list_trips_failed: ${msg}`);
  }
  return Array.isArray(json.trips) ? json.trips : [];
}

export async function createTrip(
  getToken: GetToken,
  args: CreateTripArgs,
  apiBase = '',
): Promise<TripRecord> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/trips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const json = (await res.json().catch(() => null)) as CreateResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`create_trip_failed: ${msg}`);
  }
  return json.trip;
}

/**
 * Create a trip and follow up with one POST per additional member name.
 * The owner row is created by the trips POST itself, so `memberNames`
 * should only contain the *other* travellers ("Mom", "Dad", etc.).
 *
 * Failures on individual member adds (e.g. duplicate name within the
 * trip) don't roll back the trip — the trip is already valid with just
 * the owner, and the caller can surface the failed names and retry.
 */
export async function createTripWithMembers(
  getToken: GetToken,
  args: CreateTripArgs,
  memberNames: readonly string[],
  apiBase = '',
): Promise<CreateTripWithMembersResult> {
  const trip = await createTrip(getToken, args, apiBase);

  const members: TripMember[] = [];
  const memberErrors: { display_name: string; error: string }[] = [];

  for (const raw of memberNames) {
    const display_name = raw.trim();
    if (!display_name) continue;
    try {
      const member = await addTripMember(getToken, trip.id, { display_name }, apiBase);
      members.push(member);
    } catch (e) {
      memberErrors.push({
        display_name,
        error: e instanceof Error ? e.message : 'unknown_error',
      });
    }
  }

  return { trip, members, memberErrors };
}
