// Client-side fetch wrappers for the trip-members API.
// M2 splitting needs to enumerate trip members (to assign items to people)
// and to add new members on the fly (Alika, Maya, etc.) before splitting.

export type TripMember = {
  id: string;
  trip_id: string;
  user_id: string | null; // null = anonymous member (no Clerk account claimed)
  display_name: string;
  joined_at: string;
  claimed_at: string | null;
};

export type AddTripMemberArgs = {
  display_name: string;
};

export type GetToken = () => Promise<string | null>;

type ListResponse = { ok: true; members: TripMember[] } | { ok: false; error: string };
type AddResponse = { ok: true; member: TripMember } | { ok: false; error: string; detail?: string };

export async function listTripMembers(
  getToken: GetToken,
  tripId: string,
  apiBase = '',
): Promise<TripMember[]> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/trips/${encodeURIComponent(tripId)}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as ListResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`list_trip_members_failed: ${msg}`);
  }
  return Array.isArray(json.members) ? json.members : [];
}

export async function addTripMember(
  getToken: GetToken,
  tripId: string,
  args: AddTripMemberArgs,
  apiBase = '',
): Promise<TripMember> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/trips/${encodeURIComponent(tripId)}/members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const json = (await res.json().catch(() => null)) as AddResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const errCode = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    // The server flags unique-violation (same name in same trip) as
    // duplicate_name with status 409. Callers can branch on it for nicer
    // UX without re-parsing detail strings.
    throw new Error(`add_trip_member_failed: ${errCode}`);
  }
  return json.member;
}
