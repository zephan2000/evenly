// Client-side fetch wrappers for the current user's profile (display name).
// Settings uses these to read and update how the owner appears on trips and
// in the "Paid by" picker.

export type GetToken = () => Promise<string | null>;

type ProfileResponse = { ok: true; display_name: string | null } | { ok: false; error: string };
type UpdateResponse =
  | { ok: true; display_name: string; trips_updated: number; trips_skipped: number }
  | { ok: false; error: string; detail?: string };

export async function getMyDisplayName(getToken: GetToken, apiBase = ''): Promise<string | null> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as ProfileResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`get_profile_failed: ${msg}`);
  }
  return json.display_name;
}

export async function updateMyDisplayName(
  getToken: GetToken,
  displayName: string,
  apiBase = '',
): Promise<{ display_name: string; trips_updated: number; trips_skipped: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  const json = (await res.json().catch(() => null)) as UpdateResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`update_profile_failed: ${msg}`);
  }
  return {
    display_name: json.display_name,
    trips_updated: json.trips_updated,
    trips_skipped: json.trips_skipped,
  };
}
