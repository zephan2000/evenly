// /api/expenses
//   GET  — list saved expenses for a trip (trip_id query param required).
//          Sorted by expense_date desc, created_at desc. Limit 50.
//          Returns the expense rows only (no items) for the home Recent list
//          and the future /expenses list screen. For full detail + items,
//          use GET /api/expenses/[id].
//   POST — persists an edited expense + line items via the
//          save_expense_with_items RPC (atomic transaction). RLS gates the
//          inserts.

import { z } from 'zod';

import { PersistedExpenseSchema } from '@/lib/ai/schema';
import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '@/lib/auth/server';
import { createUserClient } from '@/lib/db/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 50;

// Milestone-1 scan flow always uploads a receipt before save, so the path is
// required here. Manual-entry-without-receipt (post-MVP) gets a separate route.
// receipt_image_path is required for the scan flow but optional for manual
// entry (Tricount-style typed expenses with no receipt). Empty/missing →
// null in the DB. The save_expense_with_items RPC accepts null per its
// signature; existing column is nullable text.
const SaveExpenseRequestSchema = z.object({
  trip_id: z.string().uuid(),
  payer_member_id: z.string().uuid(),
  created_by_member_id: z.string().uuid(),
  receipt_image_path: z.string().min(1).nullable().optional(),
  expense: PersistedExpenseSchema,
});

export async function GET(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) {
    return Response.json({ ok: false, error: 'invalid_jwt' }, { status: 401 });
  }

  // Ensure the public.users row exists so trips/expenses RLS resolves.
  await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  const url = new URL(request.url);
  const tripId = url.searchParams.get('trip_id');
  if (!tripId || !UUID_RE.test(tripId)) {
    return Response.json({ ok: false, error: 'trip_id_required' }, { status: 400 });
  }

  const client = createUserClient(auth.jwt);
  const { data, error } = await client
    .from('expenses')
    .select(
      [
        'id',
        'trip_id',
        'merchant',
        'expense_date',
        'category',
        'original_amount',
        'original_currency',
        'fx_rate',
        'fx_rate_status',
        'home_amount',
        'subtotal',
        'service_charge',
        'tip',
        'tax_amount',
        'tax_mode',
        'tax_label',
        'receipt_image_path',
        'notes',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return Response.json(
      { ok: false, error: 'list_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, expenses: data ?? [] }, { status: 200 });
}

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
    // The generated Database type marks p_receipt_image_path as
    // non-nullable, but the underlying Postgres column + RPC signature both
    // accept null (manual-entry / Tricount-style expenses have no
    // receipt). Cast at the boundary; regenerating types is post-MVP.
    p_receipt_image_path: (receipt_image_path ?? null) as unknown as string,
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
