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

## Provider note (2026-05-18)

FX provider changed **frankfurter.app → ExchangeRate-API** (`open.er-api.com/v6/latest/<BASE>`, free, no key). Reason: Frankfurter (ECB-backed) does **not** publish VND (Vietnamese đồng) — a primary SE-Asia trip currency — so every VND expense hit the `rate=1` stale fallback (no conversion, only decimal-shift avoidance). ExchangeRate-API covers VND/THB/IDR/SGD and ~160 codes. Verified live; no new npm dependency (a `fetch` URL/parse change inside `lib/fx/rates.ts`); public surface (`fetchFxRate`, `FxRateError`, `FxRateStatus`) unchanged so `api/expenses.ts` and the DB RPC are untouched.

**Latest-only limitation (accepted):** the free no-key endpoint has no historical/as-of-date endpoint. A backdated expense is snapshotted at the **current** rate, not the exact expense-date rate. Same-day expenses (the dominant case for a trip app logged as you go) are therefore correct; backdated ones are approximate. A successful fetch is tagged `fresh` (not `stale`) **on purpose**: `api/expenses.ts:resolveFxSnapshot` treats `status === 'stale'` as "rate unreliable — do not convert" (`home_amount = original_amount`), so a real fetched rate must be `fresh` or it would be discarded and the VND gap would persist. `stale` now has exactly one source: the error/exception fallback (`rate = 1`).

**Path to full historical fidelity (deferred, money decision):** ExchangeRate-API's keyed Pro plan (~USD 10/mo) has a true `history/<BASE>/<Y>/<M>/<D>` endpoint. If exact backdated accuracy is needed, add a server-only `FX_API_KEY` env var and a keyed dated branch in `lib/fx/rates.ts` (the function signature already carries `date`). Not done now — out of MVP scope.

**ToS obligation (tracked, post-MVP):** ExchangeRate-API's free terms permit commercial convert-and-cache but **forbid redistribution** and require a visible "Rates By Exchange Rate API" attribution link (e.g., a Settings/About line). Low effort; tracked as a post-MVP polish item.
