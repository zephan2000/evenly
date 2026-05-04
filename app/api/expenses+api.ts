// POST /api/expenses — persists an edited expense + line items via the
// save_expense_with_items RPC (atomic transaction). RLS gates the inserts.

import { z } from 'zod';
import { PersistedExpenseSchema } from '@/lib/ai/schema';
import { getJwtFromRequest } from '@/lib/auth/server';
import { createUserClient } from '@/lib/db/server';

// Milestone-1 scan flow always uploads a receipt before save, so the path is
// required here. Manual-entry-without-receipt (post-MVP) gets a separate route.
const SaveExpenseRequestSchema = z.object({
  trip_id: z.string().uuid(),
  payer_member_id: z.string().uuid(),
  created_by_member_id: z.string().uuid(),
  receipt_image_path: z.string().min(1),
  expense: PersistedExpenseSchema,
});

export async function POST(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = SaveExpenseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { trip_id, payer_member_id, created_by_member_id, receipt_image_path, expense } =
    parsed.data;

  const client = createUserClient(auth.jwt);

  const { data, error } = await client.rpc('save_expense_with_items', {
    p_trip_id: trip_id,
    p_payer_member_id: payer_member_id,
    p_created_by_member_id: created_by_member_id,
    p_merchant: expense.merchant,
    p_expense_date: expense.expense_date,
    p_category: expense.category_guess,
    p_original_amount: expense.total_cents,
    p_original_currency: expense.currency,
    p_subtotal: expense.subtotal_cents,
    p_service_charge: expense.service_charge_cents,
    p_tip: expense.tip_cents,
    p_tax_amount: expense.tax_amount_cents,
    p_tax_mode: expense.tax_mode,
    p_tax_label: expense.tax_label,
    p_receipt_image_path: receipt_image_path,
    p_notes: expense.notes,
    p_items: expense.items.map((item, idx) => ({
      name: item.name,
      quantity: item.quantity,
      unit_amount: item.unit_amount_cents,
      amount: item.amount_cents,
      sort_order: idx,
    })),
  });

  if (error) {
    return Response.json(
      { ok: false, error: 'save_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, expense_id: data as unknown as string }, { status: 200 });
}
