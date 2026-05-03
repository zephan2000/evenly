# 0007 — FX rate snapshots at expense time

**Status:** Accepted (2026-05-03)

## Context

A trip across currencies needs a settlement currency. The question: when do we lock in the FX rate?

## Options considered

1. **Settlement-time rate:** convert at the moment users settle. Simpler, but settlements drift as rates move; doesn't match what users actually paid.
2. **Expense-time snapshot:** convert at the moment the expense is logged, store the rate. Matches credit card statements; settlements are stable.

## Decision

**Expense-time snapshot.** Each expense stores:

- `original_amount` + `original_currency` — what's on the receipt
- `fx_rate` — original→home rate at the time of the expense
- `fx_rate_status` — `'fresh' | 'stale' | 'updated'`
- `home_amount` — computed cache (`original_amount × fx_rate`), in home currency minor units

## API failure handling

When the FX API (frankfurter.app) is unreachable:

1. Use the most recent cached rate from `fx_rates` table.
2. Set `fx_rate_status = 'stale'` on the expense.
3. On next app runtime when the API is reachable, refresh stale rates and update `home_amount`. Set `fx_rate_status = 'updated'`.
4. Notify the user when rates are updated, especially if the change exceeded a threshold (>1%).

## Consequences

- `home_amount` is denormalized; recompute when `fx_rate` updates.
- Settlement view is computed from `home_amount`, so stale rates can produce slightly wrong settlements until refreshed.
- Historical accuracy: a settlement for a year-old trip uses the rates that applied then, not today's. This is the intended behavior.
- Multi-currency trips (e.g., SG → JP → TH) work cleanly: each expense knows its origin currency and locked rate.
