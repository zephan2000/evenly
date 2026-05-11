// Client-side fetch wrappers for /api/expenses/[id]/splits. Used by the
// C7 splitting screen to persist splits via save_expense_splits and to
// hydrate when revisiting an already-split expense.

export type ShareRule = 'equal_via_share_set' | 'explicit_amount' | 'percentage';

export type SplitRecord = {
  id: string;
  expense_item_id: string;
  trip_member_id: string;
  share_amount: number; // bigint serialized as number — safe up to 2^53 cents
  share_rule: ShareRule;
  share_set_id: string | null;
};

export type SaveSplitsRequest = {
  share_groups: {
    share_set_id: string | null;
    member_ids: string[];
    item_ids: string[];
    name?: string;
  }[];
  individual_panels: {
    item_id: string;
    rule: 'equal_among_selected' | 'explicit_amount';
    members: { member_id: string; amount: string }[]; // bigint as string over the wire
  }[];
};

export type SaveSplitsResponse = {
  expense_id: string;
  splits: SplitRecord[];
  /** Per-member proportional charges, keyed by trip_member_id. Inner
   *  keys are 'service_charge', 'tip', 'tax_amount'. */
  member_charges: Record<string, { service_charge: number; tip: number; tax_amount: number }>;
  /** Per-member pre-tax subtotals, keyed by trip_member_id. */
  member_subtotals: Record<string, number>;
};

export type GetToken = () => Promise<string | null>;

type SaveResponse =
  | ({ ok: true } & SaveSplitsResponse)
  | { ok: false; error: string; detail?: string };

type GetResponse =
  | { ok: true; splits: SplitRecord[] }
  | { ok: false; error: string; detail?: string };

export async function saveExpenseSplits(
  getToken: GetToken,
  expenseId: string,
  payload: SaveSplitsRequest,
  apiBase = '',
): Promise<SaveSplitsResponse> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/expenses/${encodeURIComponent(expenseId)}/splits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as SaveResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`save_expense_splits_failed: ${msg}`);
  }
  return {
    expense_id: json.expense_id,
    splits: json.splits,
    member_charges: json.member_charges,
    member_subtotals: json.member_subtotals,
  };
}

export async function getExpenseSplits(
  getToken: GetToken,
  expenseId: string,
  apiBase = '',
): Promise<SplitRecord[]> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/expenses/${encodeURIComponent(expenseId)}/splits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as GetResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`get_expense_splits_failed: ${msg}`);
  }
  return Array.isArray(json.splits) ? json.splits : [];
}
