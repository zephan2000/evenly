// Splitting math — proportional distribution of non-item charges.
//
// Locked behavior per docs/specs/m2-splitting.md §5.5:
//   - service_charge, tip, and tax_amount distribute proportionally based
//     on each member's pre-tax subtotal share.
//   - Tax/service is never user-assignable. There is no UI for it.
//   - Rounding residual goes to the largest-share member (deterministic
//     tie-break by member id ascending).
//
// This file is shared ground truth with the Postgres `save_expense_splits`
// function. The server replays the same algorithm so client and DB stay
// aligned — see supabase/migrations/*_save_expense_splits.sql.

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * A line item with its full per-member attribution. Either every member's
 * share is already known (from a share group's equal split, or an
 * explicit-amount panel), or this is unsplit and won't be part of the
 * distribution.
 *
 * Math invariant: Σ shares == amount. The reducer guarantees this; the
 * distributor trusts it.
 */
export type ItemAttribution = {
  itemId: string;
  amount: bigint;
  shares: Map<string, bigint>; // memberId → portion of `amount`
};

export type Charges = {
  service_charge: bigint;
  tip: bigint;
  tax_amount: bigint;
};

export type MemberBreakdown = {
  /** memberId → per-item share. Members with zero share on an item are
   *  omitted from this inner map. */
  items: Map<string, bigint>;
  /** Proportional service + tip + tax allocated to this member, summed. */
  charges: bigint;
  /** items_total + charges. Convenience. */
  total: bigint;
};

// ─── Equal-split helper ──────────────────────────────────────────────────

/**
 * Split `amount` into `n` equal shares. The residual cents (when amount %
 * n != 0) go to the FIRST `residual` shares — deterministic and stable
 * with the order the caller passes its members in. The reducer is
 * responsible for passing members in a stable order (typically the trip's
 * member order).
 */
export function equalSplit(amount: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const big = BigInt(n);
  const base = amount / big;
  const residual = Number(amount - base * big);
  const out: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = i < residual ? base + 1n : base;
  }
  return out;
}

// ─── Proportional distribution ───────────────────────────────────────────

/**
 * Sum every member's slice across all items. Returns a Map keyed by
 * memberId. Members with zero subtotal are NOT in the map.
 */
export function memberSubtotals(items: readonly ItemAttribution[]): Map<string, bigint> {
  const acc = new Map<string, bigint>();
  for (const item of items) {
    for (const [memberId, share] of item.shares) {
      if (share === 0n) continue;
      acc.set(memberId, (acc.get(memberId) ?? 0n) + share);
    }
  }
  return acc;
}

/**
 * Distribute a single charge proportionally to each member's subtotal
 * share, resolving the rounding residual to the largest-share member(s).
 *
 * Tie-break: when two members have equal subtotals, the one with the
 * lexicographically-smaller memberId gets the cent first. This keeps the
 * algorithm deterministic across client/server.
 *
 * Edge case — total subtotal is 0: fall back to an equal split across
 * `memberOrder`. (In practice this can't happen for a valid expense; the
 * fallback exists so a degenerate input doesn't throw.)
 */
export function distributeCharge(
  charge: bigint,
  subtotals: ReadonlyMap<string, bigint>,
  memberOrder: readonly string[],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (charge === 0n) {
    for (const memberId of memberOrder) out.set(memberId, 0n);
    return out;
  }

  const total = sumValues(subtotals);
  if (total === 0n) {
    const shares = equalSplit(charge, memberOrder.length);
    memberOrder.forEach((m, i) => out.set(m, shares[i]));
    return out;
  }

  let allocated = 0n;
  for (const memberId of memberOrder) {
    const sub = subtotals.get(memberId) ?? 0n;
    const portion = (charge * sub) / total; // bigint floor for non-negatives
    out.set(memberId, portion);
    allocated += portion;
  }

  let residual = charge - allocated;
  if (residual > 0n) {
    // Order members by subtotal desc, then memberId asc for deterministic
    // tie-break. Members not present in subtotals fall to the back.
    const ranked = memberOrder.slice().sort((a, b) => {
      const sa = subtotals.get(a) ?? 0n;
      const sb = subtotals.get(b) ?? 0n;
      if (sa === sb) return a < b ? -1 : a > b ? 1 : 0;
      return sa > sb ? -1 : 1;
    });
    let i = 0;
    while (residual > 0n && i < ranked.length) {
      const m = ranked[i];
      out.set(m, (out.get(m) ?? 0n) + 1n);
      residual -= 1n;
      i += 1;
    }
  }
  return out;
}

/**
 * Compute the per-member breakdown for an expense: their item shares plus
 * their proportional share of service+tip+tax.
 *
 * Caller passes the FULL trip member order so the residual tie-break is
 * stable. Members with no item share still appear in the output map with
 * zero items and zero charges (caller may skip them).
 */
export function distributeProportional(
  items: readonly ItemAttribution[],
  memberOrder: readonly string[],
  charges: Charges,
): Map<string, MemberBreakdown> {
  const subtotals = memberSubtotals(items);

  const service = distributeCharge(charges.service_charge, subtotals, memberOrder);
  const tip = distributeCharge(charges.tip, subtotals, memberOrder);
  const tax = distributeCharge(charges.tax_amount, subtotals, memberOrder);

  const out = new Map<string, MemberBreakdown>();
  for (const memberId of memberOrder) {
    const perItem = new Map<string, bigint>();
    let itemsTotal = 0n;
    for (const item of items) {
      const share = item.shares.get(memberId);
      if (share && share !== 0n) {
        perItem.set(item.itemId, share);
        itemsTotal += share;
      }
    }
    const chargeTotal =
      (service.get(memberId) ?? 0n) + (tip.get(memberId) ?? 0n) + (tax.get(memberId) ?? 0n);
    out.set(memberId, {
      items: perItem,
      charges: chargeTotal,
      total: itemsTotal + chargeTotal,
    });
  }
  return out;
}

// ─── Internals ───────────────────────────────────────────────────────────

function sumValues(m: ReadonlyMap<string, bigint>): bigint {
  let total = 0n;
  for (const v of m.values()) total += v;
  return total;
}
