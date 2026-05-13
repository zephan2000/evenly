// Client-side fetch wrappers for the expenses API. Used by the C6 detail
// screen and (eventually) the home recent-expenses list.

import { ExtractedExpense } from '@/lib/ai/schema';
import { formatMinor } from '@/lib/fx/currency';

export type ExpenseRecord = {
  id: string;
  trip_id: string;
  merchant: string;
  expense_date: string;
  category: ExtractedExpense['category_guess'];
  original_amount: number;
  original_currency: string;
  fx_rate: number | string;
  fx_rate_status: 'fresh' | 'stale' | 'updated';
  home_amount: number;
  subtotal: number;
  service_charge: number;
  tip: number;
  tax_amount: number;
  tax_mode: 'inclusive' | 'exclusive';
  tax_label: string;
  receipt_image_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseItem = {
  id: string;
  name: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  sort_order: number;
};

export type ExpenseDetail = {
  expense: ExpenseRecord;
  items: ExpenseItem[];
};

export type GetToken = () => Promise<string | null>;

type GetResponse =
  | { ok: true; expense: ExpenseRecord; items: ExpenseItem[] }
  | { ok: false; error: string; detail?: string };

type ListResponse =
  | { ok: true; expenses: ExpenseRecord[] }
  | { ok: false; error: string; detail?: string };

/**
 * List the recent saved expenses for a trip. Sorted by expense_date desc,
 * created_at desc. Server caps at 50; pagination is post-MVP. Returns just
 * the expense records — line items are intentionally omitted to keep the
 * list payload light (use getExpense for the detail view).
 */
export async function listExpenses(
  getToken: GetToken,
  tripId: string,
  apiBase = '',
): Promise<ExpenseRecord[]> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${apiBase}/api/expenses?trip_id=${encodeURIComponent(tripId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as ListResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`list_expenses_failed: ${msg}`);
  }
  return Array.isArray(json.expenses) ? json.expenses : [];
}

/**
 * Sum of `original_amount` across a set of expenses, grouped by currency.
 * The home hero displays the total in the trip's home_currency; for now
 * this returns a Map<currency, totalMinor>. Callers that want a single
 * scalar should pick the trip.home_currency value and accept that mixed-
 * currency totals across one trip get aggregated post-FX-conversion in a
 * follow-up (FX rates are snapshot per-expense already).
 */
export function sumByCurrency(expenses: readonly ExpenseRecord[]): Map<string, bigint> {
  const acc = new Map<string, bigint>();
  for (const e of expenses) {
    const prev = acc.get(e.original_currency) ?? 0n;
    acc.set(e.original_currency, prev + BigInt(e.original_amount));
  }
  return acc;
}

/**
 * Sum of `home_amount` (already FX-converted at expense time per ADR 0007)
 * across a set of expenses. Returns a bigint of minor units in the trip's
 * home_currency. Cleaner for the home hero than sumByCurrency when all
 * expenses are for the same trip — they share home_currency by construction.
 */
export function sumHomeAmount(expenses: readonly ExpenseRecord[]): bigint {
  let total = 0n;
  for (const e of expenses) total += BigInt(e.home_amount);
  return total;
}

/**
 * Sum of `home_amount` for rows where we trust the conversion. Excludes
 * rows tagged `fx_rate_status === 'stale'` — those are saves where the
 * FX provider didn't cover the original currency or the date range, and
 * we wrote `home_amount = original_amount` as an honest fallback (see
 * app/api/expenses+api.ts). Summing them into the hero would silently
 * mislabel foreign-currency minor units as the home currency (e.g. VND
 * 562,000 ↦ "SGD 5,620.00"). Pre-migration rows (`fx_rate_status === null`)
 * are included — they were mirrored pre-FX-wiring but in practice almost
 * all of those are same-currency, which makes the mirror correct.
 */
export function sumHomeAmountConfident(expenses: readonly ExpenseRecord[]): bigint {
  let total = 0n;
  for (const e of expenses) {
    if (e.fx_rate_status === 'stale') continue;
    total += BigInt(e.home_amount);
  }
  return total;
}

/**
 * How many rows we couldn't FX-convert. The home hero shows a small
 * "(N not converted)" hint so the displayed total doesn't quietly under-
 * report the trip.
 */
export function countStaleFx(expenses: readonly ExpenseRecord[]): number {
  return expenses.filter((e) => e.fx_rate_status === 'stale').length;
}

export async function getExpense(
  getToken: GetToken,
  id: string,
  apiBase = '',
): Promise<ExpenseDetail | null> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/expenses/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;

  const json = (await res.json().catch(() => null)) as GetResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`get_expense_failed: ${msg}`);
  }
  return { expense: json.expense, items: json.items };
}

type SaveResponse =
  | { ok: true; expense_id: string }
  | { ok: false; error: string; detail?: string };

type DeleteResponse = { ok: true; id: string } | { ok: false; error: string; detail?: string };

export type SaveManualExpenseArgs = {
  tripId: string;
  payerMemberId: string;
  createdByMemberId: string;
  expense: import('@/lib/ai/schema').PersistedExpense;
};

/**
 * Save a manually-entered expense (no receipt). Mirrors the scan-flow
 * save path but passes receipt_image_path as null. The server schema
 * accepts null for Tricount-style typed entries; the DB column is
 * nullable.
 */
export async function saveManualExpense(
  getToken: GetToken,
  args: SaveManualExpenseArgs,
  apiBase = '',
): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/expenses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trip_id: args.tripId,
      payer_member_id: args.payerMemberId,
      created_by_member_id: args.createdByMemberId,
      receipt_image_path: null,
      expense: args.expense,
    }),
  });
  const json = (await res.json().catch(() => null)) as SaveResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`save_manual_expense_failed: ${msg}`);
  }
  return json.expense_id;
}

/**
 * Soft-delete a saved expense by setting deleted_at = now() server-side.
 * Callers should wrap this in a UI-level undo window (typically ~5s) — the
 * server has no resurrection path, so the call should only fire after the
 * undo window has lapsed without an undo tap.
 *
 * 404 (not_found) means either the row doesn't exist or the caller can't
 * see it (trips_select_owner RLS). The server intentionally doesn't
 * distinguish — both should look identical to a non-owner.
 */
export async function deleteExpense(
  getToken: GetToken,
  id: string,
  apiBase = '',
): Promise<{ ok: true } | { ok: 'not_found' }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${apiBase}/api/expenses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { ok: 'not_found' };

  const json = (await res.json().catch(() => null)) as DeleteResponse | null;
  if (!res.ok || !json || json.ok !== true) {
    const msg = json && 'error' in json ? json.error : `HTTP ${res.status}`;
    throw new Error(`delete_expense_failed: ${msg}`);
  }
  return { ok: true };
}

/**
 * Format an expense's primary money value for glance display.
 * Uses the original currency (not home_amount) — what the user paid is
 * what most people remember a receipt by.
 */
export function formatExpenseTotal(expense: ExpenseRecord): string {
  return `${expense.original_currency} ${formatMinor(BigInt(expense.original_amount), expense.original_currency)}`;
}
