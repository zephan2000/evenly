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

/**
 * Format an expense's primary money value for glance display.
 * Uses the original currency (not home_amount) — what the user paid is
 * what most people remember a receipt by.
 */
export function formatExpenseTotal(expense: ExpenseRecord): string {
  return `${expense.original_currency} ${formatMinor(BigInt(expense.original_amount), expense.original_currency)}`;
}
