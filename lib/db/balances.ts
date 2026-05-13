// Client wrapper for /api/trips/[id]/balances. Powers the "Settle softly"
// section on home — what the user fronted, what they're owed, what they owe.
//
// Wire-format note: minor-unit amounts come back as strings because BigInt
// doesn't survive JSON. The wrapper narrows them back to BigInt at the
// boundary so callers can do native arithmetic.

export type TripBalances = {
  homeCurrency: string;
  youPaid: bigint;
  owedToYou: bigint;
  youOwe: bigint;
  netOwedToYou: bigint;
  peopleCount: number;
};

export type GetToken = () => Promise<string | null>;

type RawResponse =
  | {
      ok: true;
      home_currency: string;
      you_paid_minor: string;
      owed_to_you_minor: string;
      you_owe_minor: string;
      net_owed_to_you_minor: string;
      people_count: number;
    }
  | { ok: false; error: string; detail?: string };

export async function getTripBalances(
  getToken: GetToken,
  tripId: string,
  apiBase = '',
): Promise<TripBalances> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/trips/${encodeURIComponent(tripId)}/balances`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as RawResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`get_trip_balances_failed: ${msg}`);
  }
  return {
    homeCurrency: json.home_currency,
    youPaid: BigInt(json.you_paid_minor),
    owedToYou: BigInt(json.owed_to_you_minor),
    youOwe: BigInt(json.you_owe_minor),
    netOwedToYou: BigInt(json.net_owed_to_you_minor),
    peopleCount: json.people_count,
  };
}
