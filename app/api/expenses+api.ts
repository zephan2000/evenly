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
import { getCurrencyDecimals } from '@/lib/fx/currency';
import { FxRateError, fetchFxRate, type FxRateStatus } from '@/lib/fx/rates';

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

  // Trust only the server for home_currency. The POST body intentionally
  // omits it; RLS gates this select to trip members.
  const { data: tripRow, error: tripErr } = await client
    .from('trips')
    .select('home_currency')
    .eq('id', trip_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (tripErr) {
    return Response.json(
      { ok: false, error: 'trip_lookup_failed', detail: tripErr.message },
      { status: 500 },
    );
  }
  if (!tripRow?.home_currency) {
    return Response.json({ ok: false, error: 'trip_not_found' }, { status: 404 });
  }

  const homeCurrency = tripRow.home_currency;
  const fx = await resolveFxSnapshot({
    from: expense.currency,
    to: homeCurrency,
    date: expense.expense_date,
  });
  // When the FX lookup falls back to stale (rate=1), DO NOT run
  // convertMinorUnits — that path applies the decimal-shift between
  // currencies, which for a 0-decimal currency like VND saving to a
  // 2-decimal home like SGD inflates the home_amount by 100×. The
  // honest fallback is to keep the original minor units; the UI shows
  // an "FX unavailable" indicator off the fx_rate_status column. Same-
  // currency rows also go down this path (rate=1, status=fresh), which
  // is fine because original minor units already match home minor units.
  const sameCurrency = expense.currency.trim().toUpperCase() === homeCurrency.trim().toUpperCase();
  const homeAmountMinor =
    sameCurrency || fx.status === 'stale'
      ? BigInt(expense.total_cents)
      : convertMinorUnits({
          amountMinor: BigInt(expense.total_cents),
          fromCurrency: expense.currency,
          toCurrency: homeCurrency,
          rate: fx.rate,
        });

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
    p_fx_rate: fx.rate,
    p_fx_rate_status: fx.status,
    // home_amount is bigint in Postgres; the generated Args type widens to
    // `number`. Cast at the boundary so PostgREST sees a JSON number string
    // it can parse into bigint without overflowing JS Number (BigInt → string
    // would also work but `number` matches the generated signature).
    p_home_amount: Number(homeAmountMinor),
  });

  if (error) {
    return Response.json(
      { ok: false, error: 'save_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, expense_id: data as unknown as string }, { status: 200 });
}

// ─── FX snapshot helpers ─────────────────────────────────────────────────
// ADR 0007: snapshot the rate at expense save time. Frankfurter is the
// source. On API failure (network, 5xx) or unsupported currency, downgrade
// to { rate: 1, status: 'stale' } so the save still succeeds and the issue
// is fixable later via a refresh job (post-MVP). We log at DEBUG-equivalent
// (console.warn here; production scrubbing is per ADR 0007 / data-model.md).

async function resolveFxSnapshot(args: {
  from: string;
  to: string;
  date: string;
}): Promise<{ rate: number; status: FxRateStatus }> {
  try {
    return await fetchFxRate(args.from, args.to, args.date);
  } catch (err) {
    if (err instanceof FxRateError) {
      // Do not log amounts or merchant — only the rate-resolution context.
      console.warn(
        `[fx] downgraded ${args.from}->${args.to} to stale: ${err.kind}${err.status ? ` (${err.status})` : ''}`,
      );
      return { rate: 1, status: 'stale' };
    }
    console.warn(`[fx] downgraded ${args.from}->${args.to} to stale: unknown error`);
    return { rate: 1, status: 'stale' };
  }
}

/**
 * Convert minor units from one currency to another using a snapshot rate.
 *
 * The math: rate is original→home, expressed in major units (e.g. 1 VND =
 * 0.0000537 SGD). Minor units differ between currencies (VND has 0
 * decimals, SGD has 2). The formula is:
 *
 *   home_minor = round( original_minor / 10^from_dec * rate * 10^to_dec )
 *
 * Worked example for the docstring (and for the verification step in the
 * brief): VND 562,000 → SGD at rate 0.0000537.
 *   original_minor = 562000 (VND has 0 decimals, so minor == major)
 *   home_minor = round(562000 / 1 * 0.0000537 * 100)
 *              = round(3017.94)
 *              = 3018  → SGD 30.18.
 *
 * We do the rate × decimals-scale arithmetic in `number` (the rate is
 * inherently a Number from JSON), then convert to BigInt with explicit
 * round-half-up — never letting `Number` represent the final integer if it
 * exceeds 2^53. Round-half-up matches POSIX `printf %.0f` and what a
 * non-finance user expects; banker's rounding would be silently surprising
 * for a 0.5-cent edge case.
 */
function convertMinorUnits(args: {
  amountMinor: bigint;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}): bigint {
  const { amountMinor, fromCurrency, toCurrency, rate } = args;
  if (fromCurrency.trim().toUpperCase() === toCurrency.trim().toUpperCase()) {
    return amountMinor;
  }
  const fromDec = getCurrencyDecimals(fromCurrency);
  const toDec = getCurrencyDecimals(toCurrency);

  // Step 1: original_minor → major (Number is fine; amounts here are small).
  const amountMajor = Number(amountMinor) / 10 ** fromDec;
  // Step 2: major × rate → home major.
  const homeMajor = amountMajor * rate;
  // Step 3: home major → home minor as a float, then round half-up to BigInt.
  const homeMinorFloat = homeMajor * 10 ** toDec;
  return roundHalfUpToBigInt(homeMinorFloat);
}

function roundHalfUpToBigInt(n: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  // Math.round in JS rounds half-AWAY-from-zero for positives but half-UP
  // for negatives in a way that doesn't match "+1 if frac >= 0.5" near zero.
  // Use Math.floor(x + 0.5) for the positive branch and -floor(|x| + 0.5)
  // for the negative branch so behavior is symmetric.
  const sign = n < 0 ? -1n : 1n;
  const abs = Math.abs(n);
  const rounded = Math.floor(abs + 0.5);
  return sign * BigInt(rounded);
}
