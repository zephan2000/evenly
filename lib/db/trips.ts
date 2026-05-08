// Client-side helpers for the /api/trips endpoint. Browser/native fetch.
//
// Returned shape carries everything the QC screen needs: trip id (for the
// upload path + saveContext.tripId) and the owner's trip_member id (for
// saveContext.payerMemberId / createdByMemberId).

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
