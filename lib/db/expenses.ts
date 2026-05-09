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
