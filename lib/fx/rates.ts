// Server-only. Do not import from client components or screens.
// Fetches FX rates from ExchangeRate-API's free, no-key "open" endpoint
// (https://open.er-api.com/v6/latest/<BASE>) for the per-expense snapshot
// policy in ADR 0007.
//
// Replaced frankfurter.app: it does NOT cover VND (Vietnamese đồng) — a
// primary SE-Asia trip currency — which forced the rate=1 stale fallback
// (no conversion at all). ExchangeRate-API covers VND/THB/IDR/SGD+. See
// ADR 0007 "Provider note (2026-05-18)".
//
// Contract:
//   - Same-currency calls short-circuit to { rate: 1, status: 'fresh' }.
//   - A successful response with a numeric rate yields { rate, status:
//     'fresh' }. The free tier is LATEST-ONLY (no historical endpoint),
//     so a backdated expense is snapshotted at the *current* rate, not the
//     exact expense-date rate. We deliberately still return 'fresh' (never
//     'stale') on success: the caller (api/expenses.ts:resolveFxSnapshot)
//     treats `status === 'stale'` as "rate unreliable — do NOT convert"
//     (home_amount = original_amount). A real fetched rate MUST be 'fresh'
//     or it would be discarded and the VND bug would persist. Exact
//     historical-date fidelity needs the keyed Pro endpoint — a future
//     money decision, see ADR 0007.
//   - Unsupported currency / missing rate / typed API error → a typed
//     `FxRateError`. Callers downgrade to { rate: 1, status: 'stale' }
//     (the only 'stale' source now) so the row still saves and a refresh
//     job can fix it later (ADR 0007 §"API failure handling"). We do NOT
//     swallow the error here — callers want to log it.

const EXRATE_BASE = 'https://open.er-api.com/v6';

export type FxRateStatus = 'fresh' | 'stale';

export type FxRateResult = {
  rate: number;
  status: FxRateStatus;
};

export type FxRateErrorKind =
  | 'unsupported_currency' // 404, typed API error, or rate missing from payload
  | 'transient' // network blip or 5xx
  | 'bad_payload'; // 2xx with shape we don't understand

export class FxRateError extends Error {
  readonly kind: FxRateErrorKind;
  readonly status?: number;
  constructor(kind: FxRateErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'FxRateError';
    this.kind = kind;
    this.status = status;
  }
}

export type FetchFxRateOptions = {
  fetchImpl?: typeof fetch;
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Fetch the FX rate from `from` to `to`.
 *
 * `date` (ISO `YYYY-MM-DD`) is accepted for interface stability and a
 * future keyed-historical path, but the free ExchangeRate-API endpoint is
 * latest-only — the snapshot uses the current published rate regardless of
 * `date`. For same-day expenses (the common case in a trip app) that is
 * the correct expense-time rate; backdated expenses get an approximate
 * (current) rate. See ADR 0007.
 *
 * Throws `FxRateError` for unsupported currencies, transient failures, and
 * unrecognized payloads. Callers should decide whether to fall back to
 * `{ rate: 1, status: 'stale' }`.
 */
export async function fetchFxRate(
  from: string,
  to: string,
  date?: string,
  opts: FetchFxRateOptions = {},
): Promise<FxRateResult> {
  const fromCode = normalizeCode(from);
  const toCode = normalizeCode(to);
  if (fromCode === toCode) {
    return { rate: 1, status: 'fresh' };
  }

  // Free tier is latest-only; `date` does not change the lookup. Referenced
  // so the intentional non-use is explicit (and lint-clean).
  void date;

  const fetchFn = opts.fetchImpl ?? fetch;
  const r = await tryFetch(fetchFn, fromCode, toCode);
  if (r.kind === 'rate') {
    return { rate: r.rate, status: 'fresh' };
  }
  throw r.error;
}

type TryFetchResult = { kind: 'rate'; rate: number } | { kind: 'error'; error: FxRateError };

async function tryFetch(
  fetchFn: typeof fetch,
  fromCode: string,
  toCode: string,
): Promise<TryFetchResult> {
  // open.er-api.com/v6/latest/<BASE> returns { result, base_code, rates }.
  // rates maps every supported code → units of <code> per 1 <BASE>, so the
  // from->to rate is rates[toCode].
  const url = `${EXRATE_BASE}/latest/${encodeURIComponent(fromCode)}`;
  let resp: Response;
  try {
    resp = await fetchFn(url, { method: 'GET' });
  } catch (cause) {
    return {
      kind: 'error',
      error: new FxRateError('transient', `fx fetch network error: ${String(cause)}`),
    };
  }

  if (resp.status === 404) {
    // Unknown/unsupported base currency in the path.
    return {
      kind: 'error',
      error: new FxRateError(
        'unsupported_currency',
        `exchangerate-api 404 for base ${fromCode}`,
        404,
      ),
    };
  }
  if (!resp.ok) {
    return {
      kind: 'error',
      error: new FxRateError('transient', `exchangerate-api status ${resp.status}`, resp.status),
    };
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch (cause) {
    return {
      kind: 'error',
      error: new FxRateError('bad_payload', `exchangerate-api bad json: ${String(cause)}`),
    };
  }

  // The open endpoint signals bad/unsupported codes with
  // { result: "error", "error-type": "unsupported-code" | ... }, sometimes
  // with HTTP 200. Treat any non-success result as unsupported.
  if (isErrorResult(payload)) {
    return {
      kind: 'error',
      error: new FxRateError(
        'unsupported_currency',
        `exchangerate-api error for ${fromCode}: ${errorType(payload)}`,
      ),
    };
  }

  const rate = readRate(payload, toCode);
  if (rate === null) {
    return {
      kind: 'error',
      error: new FxRateError(
        'unsupported_currency',
        `exchangerate-api response missing ${toCode} rate for ${fromCode}`,
      ),
    };
  }
  return { kind: 'rate', rate };
}

function isErrorResult(payload: unknown): boolean {
  return (
    !!payload && typeof payload === 'object' && (payload as { result?: unknown }).result === 'error'
  );
}

function errorType(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const e = (payload as Record<string, unknown>)['error-type'];
  return typeof e === 'string' ? e : 'unknown';
}

function readRate(payload: unknown, toCode: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const rates = (payload as { rates?: unknown }).rates;
  if (!rates || typeof rates !== 'object') return null;
  const value = (rates as Record<string, unknown>)[toCode];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
