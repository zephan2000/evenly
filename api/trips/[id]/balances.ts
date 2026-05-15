// /api/trips/[id]/balances
//
// Returns the "Settle softly" numbers the home hero displays:
//   - you_paid:        what the current user fronted (home-currency minor units)
//   - others_owe_you:  total share_amount on expenses you paid, owed by others
//   - you_owe_others:  total share_amount you owe on expenses someone else paid
//   - net_owed_to_you: others_owe_you − you_owe_others (can be negative)
//   - people_count:    distinct counterparties with a non-zero balance
//
// Splits are stored in original_currency minor units on expense_item_splits.
// The home displays in trip.home_currency, so we apply the per-expense fx_rate
// snapshot at aggregation time. Stale FX rows (where the rate fallback was
// rate=1) are summed as-is, matching the home's other "stale = treat as
// home currency" fallback — imperfect but consistent.

import {
  decodeJwtClaims,
  getJwtFromRequest,
  upsertUserOnFirstSeen,
} from '../../../lib/auth/server';
import { createUserClient } from '../../../lib/db/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractTripId(request: Request): string | null {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('trips');
  if (idx < 0) return null;
  const candidate = segments[idx + 1];
  return candidate && UUID_RE.test(candidate) ? candidate : null;
}

// Mirrors the convertMinorUnits logic in /api/expenses+api.ts. Decimal lookup
// kept local to avoid pulling client currency tables onto the server.
const DECIMALS_BY_CODE: Record<string, number> = {
  SGD: 2,
  USD: 2,
  EUR: 2,
  MYR: 2,
  GBP: 2,
  AUD: 2,
  NZD: 2,
  HKD: 2,
  CHF: 2,
  CNY: 2,
  THB: 2,
  IDR: 2,
  PHP: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  JOD: 3,
  OMR: 3,
  TND: 3,
};
function decimalsOf(code: string): number {
  return DECIMALS_BY_CODE[code.trim().toUpperCase()] ?? 2;
}

/**
 * Convert `amountMinor` from `from` minor units to `to` minor units using the
 * snapshot `rate`. Same math as the save path; centralized here so the
 * balance numbers exactly match what the row was stored as.
 */
function convertMinor(
  amountMinor: bigint,
  from: string,
  to: string,
  rate: number,
  fxStatus: string | null,
): bigint {
  const fromU = from.trim().toUpperCase();
  const toU = to.trim().toUpperCase();
  if (fromU === toU) return amountMinor;
  // Stale fallback: home_amount on the expense itself was stored as the
  // original minor units. We do the same here for consistency — splits in
  // a stale row contribute their raw minor units.
  if (fxStatus === 'stale') return amountMinor;
  const fromDec = decimalsOf(fromU);
  const toDec = decimalsOf(toU);
  const major = Number(amountMinor) / 10 ** fromDec;
  const homeMajor = major * rate;
  const homeMinorFloat = homeMajor * 10 ** toDec;
  if (!Number.isFinite(homeMinorFloat)) return 0n;
  const abs = Math.abs(homeMinorFloat);
  const rounded = Math.floor(abs + 0.5);
  const sign = homeMinorFloat < 0 ? -1n : 1n;
  return sign * BigInt(rounded);
}

export async function GET(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }
  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) {
    return Response.json({ ok: false, error: 'invalid_jwt' }, { status: 401 });
  }
  const { id: userId } = await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  const tripId = extractTripId(request);
  if (!tripId) {
    return Response.json({ ok: false, error: 'invalid_trip_id' }, { status: 400 });
  }

  const client = createUserClient(auth.jwt);

  // Resolve caller's member row in this trip. RLS already restricts to trips
  // the caller can see; if they're not a member of this trip, we surface 404.
  const { data: meRow, error: meErr } = await client
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  if (meErr) {
    return Response.json(
      { ok: false, error: 'member_lookup_failed', detail: meErr.message },
      { status: 500 },
    );
  }
  if (!meRow) {
    return Response.json({ ok: false, error: 'not_a_member' }, { status: 404 });
  }
  const myMemberId = meRow.id as string;

  // Trip's home_currency for the conversion target.
  const { data: tripRow, error: tripErr } = await client
    .from('trips')
    .select('home_currency')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tripErr || !tripRow) {
    return Response.json({ ok: false, error: 'trip_not_found' }, { status: 404 });
  }
  const homeCurrency = tripRow.home_currency as string;

  // Pull all live expenses with the columns we need for FX + payer.
  const { data: expenses, error: expensesErr } = await client
    .from('expenses')
    .select('id, payer_member_id, original_currency, fx_rate, fx_rate_status, home_amount')
    .eq('trip_id', tripId)
    .is('deleted_at', null);
  if (expensesErr) {
    return Response.json(
      { ok: false, error: 'expenses_failed', detail: expensesErr.message },
      { status: 500 },
    );
  }

  // you_paid: sum of home_amount on expenses I fronted. Use the snapshotted
  // home_amount column directly — that's what we have in the right currency
  // already.
  let youPaid = 0n;
  for (const e of expenses ?? []) {
    if (e.payer_member_id === myMemberId) {
      youPaid += BigInt(e.home_amount ?? 0);
    }
  }

  // Pull every split row attached to this trip's expense items, in one query.
  // We aggregate them client-side per expense so we can convert with that
  // expense's snapshotted fx_rate.
  const expenseIds = (expenses ?? []).map((e) => e.id);
  let owedToYou = 0n;
  let youOwe = 0n;
  const counterparties = new Set<string>();

  if (expenseIds.length > 0) {
    const { data: splits, error: splitsErr } = await client
      .from('expense_item_splits')
      .select('trip_member_id, share_amount, expense_item:expense_items!inner(expense_id)')
      .in('expense_item.expense_id', expenseIds);
    if (splitsErr) {
      return Response.json(
        { ok: false, error: 'splits_failed', detail: splitsErr.message },
        { status: 500 },
      );
    }

    // Index expenses by id so we can resolve payer + fx during reduce.
    const byExpense = new Map(
      (expenses ?? []).map((e) => [
        e.id,
        {
          payer: e.payer_member_id as string,
          currency: e.original_currency as string,
          rate: Number(e.fx_rate ?? 1),
          status: (e.fx_rate_status ?? null) as string | null,
        },
      ]),
    );

    for (const row of splits ?? []) {
      const itemJoin = row.expense_item as unknown as { expense_id: string } | null;
      if (!itemJoin) continue;
      const meta = byExpense.get(itemJoin.expense_id);
      if (!meta) continue;
      const member = row.trip_member_id as string;
      const homeMinor = convertMinor(
        BigInt(row.share_amount),
        meta.currency,
        homeCurrency,
        meta.rate,
        meta.status,
      );

      if (meta.payer === myMemberId && member !== myMemberId) {
        owedToYou += homeMinor;
        counterparties.add(member);
      } else if (meta.payer !== myMemberId && member === myMemberId) {
        youOwe += homeMinor;
        counterparties.add(meta.payer);
      }
    }
  }

  const net = owedToYou - youOwe;

  return Response.json(
    {
      ok: true,
      home_currency: homeCurrency,
      // BigInt is not JSON-safe; emit as strings. Client parses with BigInt().
      you_paid_minor: youPaid.toString(),
      owed_to_you_minor: owedToYou.toString(),
      you_owe_minor: youOwe.toString(),
      net_owed_to_you_minor: net.toString(),
      people_count: counterparties.size,
    },
    { status: 200 },
  );
}
