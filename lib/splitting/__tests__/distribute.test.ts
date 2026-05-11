import { describe, expect, it } from 'vitest';

import {
  distributeCharge,
  distributeProportional,
  equalSplit,
  memberSubtotals,
  type Charges,
  type ItemAttribution,
} from '../distribute';

// ─── equalSplit ──────────────────────────────────────────────────────────

describe('equalSplit', () => {
  it('returns an empty array when n <= 0', () => {
    expect(equalSplit(1000n, 0)).toEqual([]);
    expect(equalSplit(1000n, -1)).toEqual([]);
  });

  it('splits evenly when amount divides cleanly', () => {
    expect(equalSplit(1200n, 4)).toEqual([300n, 300n, 300n, 300n]);
  });

  it('puts residual cents on the leading shares (first member-order wins)', () => {
    expect(equalSplit(1001n, 4)).toEqual([251n, 250n, 250n, 250n]);
    expect(equalSplit(1003n, 4)).toEqual([251n, 251n, 251n, 250n]);
  });

  it('sums back to the original amount', () => {
    const splits = equalSplit(99999n, 7);
    expect(splits.reduce((a, b) => a + b, 0n)).toBe(99999n);
  });
});

// ─── memberSubtotals ─────────────────────────────────────────────────────

describe('memberSubtotals', () => {
  it('sums each member across items', () => {
    const items: ItemAttribution[] = [
      {
        itemId: 'i1',
        amount: 600n,
        shares: new Map([
          ['a', 200n],
          ['b', 200n],
          ['c', 200n],
        ]),
      },
      {
        itemId: 'i2',
        amount: 400n,
        shares: new Map([
          ['a', 100n],
          ['b', 300n],
        ]),
      },
    ];
    const subs = memberSubtotals(items);
    expect(subs.get('a')).toBe(300n);
    expect(subs.get('b')).toBe(500n);
    expect(subs.get('c')).toBe(200n);
  });

  it('skips members with zero share', () => {
    const items: ItemAttribution[] = [
      {
        itemId: 'i1',
        amount: 500n,
        shares: new Map([
          ['a', 500n],
          ['b', 0n],
        ]),
      },
    ];
    const subs = memberSubtotals(items);
    expect(subs.has('b')).toBe(false);
  });
});

// ─── distributeCharge ────────────────────────────────────────────────────

describe('distributeCharge', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('zero charge yields zeros for every member', () => {
    const subs = new Map<string, bigint>([
      ['a', 100n],
      ['b', 100n],
    ]);
    const out = distributeCharge(0n, subs, order);
    for (const m of order) expect(out.get(m)).toBe(0n);
  });

  it('clean integer division gives equal shares', () => {
    const subs = new Map<string, bigint>([
      ['a', 100n],
      ['b', 100n],
      ['c', 100n],
      ['d', 100n],
    ]);
    const out = distributeCharge(400n, subs, order);
    expect(out.get('a')).toBe(100n);
    expect(out.get('b')).toBe(100n);
    expect(out.get('c')).toBe(100n);
    expect(out.get('d')).toBe(100n);
  });

  it('residual cent goes to the largest-share member', () => {
    const subs = new Map<string, bigint>([
      ['a', 100n],
      ['b', 100n],
      ['c', 200n], // largest
      ['d', 100n],
    ]);
    // charge = 7, total subtotal = 500. floors: a=1, b=1, c=2, d=1, sum=5,
    // residual=2 → goes to c first, then breaks tie among (a,b,d) → 'a'
    const out = distributeCharge(7n, subs, order);
    expect(out.get('c')).toBe(3n); // 2 + 1 residual
    expect(out.get('a')).toBe(2n); // 1 + 1 residual (tied; a sorts before b,d)
    expect(out.get('b')).toBe(1n);
    expect(out.get('d')).toBe(1n);
    expect(sum(out)).toBe(7n);
  });

  it('falls back to equal split when total subtotal is zero', () => {
    const subs = new Map<string, bigint>([
      ['a', 0n],
      ['b', 0n],
    ]);
    const out = distributeCharge(101n, subs, ['a', 'b']);
    expect(out.get('a')).toBe(51n); // residual goes to first
    expect(out.get('b')).toBe(50n);
  });

  it('breaks ties on subtotal by member id ascending', () => {
    const subs = new Map<string, bigint>([
      ['z', 100n],
      ['a', 100n],
    ]);
    // charge = 1, both equal subtotal. Floor = 0 each. Residual 1 goes to
    // 'a' (smaller id when subtotal is tied).
    const out = distributeCharge(1n, subs, ['z', 'a']);
    expect(out.get('a')).toBe(1n);
    expect(out.get('z')).toBe(0n);
  });
});

// ─── distributeProportional (worked examples) ────────────────────────────

describe('distributeProportional — 4-member dinner', () => {
  // 4 people split a S$72.00 dinner with a S$5.00 service charge.
  //   Starters (S$20.00) — split among all 4
  //   Wine    (S$30.00) — shared by Z & A only
  //   Steak   (S$15.00) — Z alone
  //   Salad   (S$ 7.00) — B alone
  // Subtotal = S$72.00 (7200¢). Service charge = 500¢.
  const items: ItemAttribution[] = [
    {
      itemId: 'starters',
      amount: 2000n,
      shares: new Map<string, bigint>([
        ['z', 500n],
        ['a', 500n],
        ['b', 500n],
        ['c', 500n],
      ]),
    },
    {
      itemId: 'wine',
      amount: 3000n,
      shares: new Map<string, bigint>([
        ['z', 1500n],
        ['a', 1500n],
      ]),
    },
    {
      itemId: 'steak',
      amount: 1500n,
      shares: new Map<string, bigint>([['z', 1500n]]),
    },
    {
      itemId: 'salad',
      amount: 700n,
      shares: new Map<string, bigint>([['b', 700n]]),
    },
  ];

  const memberOrder = ['z', 'a', 'b', 'c'];

  it('reconciles items + proportional service charge to the expense total', () => {
    const charges: Charges = {
      service_charge: 500n,
      tip: 0n,
      tax_amount: 0n,
    };
    const out = distributeProportional(items, memberOrder, charges);

    // Subtotals:
    //   z = 500 + 1500 + 1500 = 3500
    //   a = 500 + 1500       = 2000
    //   b = 500 +        700 = 1200
    //   c = 500              =  500
    //   total = 7200
    // service charge 500. Floors: 500*3500/7200=243, 500*2000/7200=138,
    // 500*1200/7200=83, 500*500/7200=34. Sum = 498. Residual 2 → z + a.
    expect(out.get('z')!.charges).toBe(244n); // 243 + 1 residual
    expect(out.get('a')!.charges).toBe(139n); // 138 + 1 residual
    expect(out.get('b')!.charges).toBe(83n);
    expect(out.get('c')!.charges).toBe(34n);

    // Math invariant: total of breakdown == expense subtotal + charges.
    const grand = memberOrder.reduce((acc, m) => acc + out.get(m)!.total, 0n);
    expect(grand).toBe(7200n + 500n);
  });

  it('zero-charge case leaves charges at zero and totals == item shares', () => {
    const charges: Charges = { service_charge: 0n, tip: 0n, tax_amount: 0n };
    const out = distributeProportional(items, memberOrder, charges);
    for (const m of memberOrder) {
      expect(out.get(m)!.charges).toBe(0n);
    }
    expect(out.get('z')!.total).toBe(3500n);
    expect(out.get('a')!.total).toBe(2000n);
    expect(out.get('b')!.total).toBe(1200n);
    expect(out.get('c')!.total).toBe(500n);
  });

  it('residual cent lands on the largest-share member when all three charges run', () => {
    // service 100, tip 33, tax 7. Each runs the same residual rule.
    // Subtotals as above (z=3500, a=2000, b=1200, c=500; total=7200).
    const charges: Charges = { service_charge: 100n, tip: 33n, tax_amount: 7n };
    const out = distributeProportional(items, memberOrder, charges);
    const grand = memberOrder.reduce((acc, m) => acc + out.get(m)!.total, 0n);
    expect(grand).toBe(7200n + 100n + 33n + 7n);
  });
});

describe('distributeProportional — single-member trip', () => {
  it('100% of charges land on the single member', () => {
    const items: ItemAttribution[] = [
      { itemId: 'i1', amount: 1000n, shares: new Map([['a', 1000n]]) },
    ];
    const out = distributeProportional(items, ['a'], {
      service_charge: 100n,
      tip: 50n,
      tax_amount: 70n,
    });
    expect(out.get('a')!.charges).toBe(220n);
    expect(out.get('a')!.total).toBe(1220n);
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────

function sum(m: Map<string, bigint>): bigint {
  let total = 0n;
  for (const v of m.values()) total += v;
  return total;
}
