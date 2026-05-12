// Server-only. Do not import from client components or screens.
// Fetches FX rates from frankfurter.app (ECB-backed, free, no key) for the
// per-expense snapshot policy laid out in ADR 0007.
//
// Contract:
//   - Same-currency calls short-circuit to { rate: 1, status: 'fresh' }.
//   - A successful HTTP response with a numeric rate in the payload yields
//     { rate, status: 'fresh' }.
//   - Frankfurter doesn't cover every currency (VND is supported; some
//     long-tails are not). On a 404 or missing rate we throw a typed
//     `FxRateError`. Callers downgrade to { rate: 1, status: 'stale' } so the
//     row still saves and the issue is surfaced as a refresh later (see ADR
//     0007 §"API failure handling"). We deliberately do NOT swallow the error
//     here — callers want to log it.

const FRANKFURTER_BASE = 'https://api.frankfurter.app';

export type FxRateStatus = 'fresh' | 'stale';

export type FxRateResult = {
  rate: number;
  status: FxRateStatus;
};

export type FxRateErrorKind =
  | 'unsupported_currency' // 404 or rate missing from payload
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
 * Fetch the FX rate from `from` to `to`. `date` (ISO `YYYY-MM-DD`) requests a
 * historical rate; omit it for the latest published rate. Frankfurter ECB
 * rates are published once per business day; weekend dates resolve to the
 * preceding Friday's rate, which is what we want for an expense snapshot.
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

  const fetchFn = opts.fetchImpl ?? fetch;
  const hasDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  // Try the dated endpoint first when a date is provided. Frankfurter 404s
  // when the date is outside its data range (e.g. future-dated receipts, or
  // pre-1999); for that case we fall through to `latest` rather than giving
  // up — a stale-by-a-few-days rate is much better for the user than no
  // rate at all + the decimal-shift inflation that comes from rate=1
  // fallback (see the convertMinorUnits trap in app/api/expenses+api.ts).
  if (hasDate) {
    const r = await tryFetch(fetchFn, date as string, fromCode, toCode);
    if (r.kind === 'rate') return { rate: r.rate, status: 'fresh' };
    // 404 on the dated request → fall through to latest. Any other error
    // (transient, bad_payload, unsupported with a non-404 200 response)
    // throws now since latest probably won't help and we want callers to
    // log it.
    if (r.kind !== 'date_out_of_range') throw r.error;
  }

  const r = await tryFetch(fetchFn, 'latest', fromCode, toCode);
  if (r.kind === 'rate') {
    // Tag as fresh if no date was requested; stale if we fell back from a
    // dated request — UI can use this to show a tiny "rate-from-today"
    // tooltip on backdated expenses.
    return { rate: r.rate, status: hasDate ? 'stale' : 'fresh' };
  }
  throw r.error;
}

type TryFetchResult =
  | { kind: 'rate'; rate: number }
  | { kind: 'date_out_of_range'; error: FxRateError }
  | { kind: 'error'; error: FxRateError };

async function tryFetch(
  fetchFn: typeof fetch,
  path: string,
  fromCode: string,
  toCode: string,
): Promise<TryFetchResult> {
  const url = `${FRANKFURTER_BASE}/${path}?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`;
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
    // Frankfurter returns 404 for both unsupported currency pairs AND for
    // dates outside its data range. We can't easily tell apart from the
    // response, so when we got here from a dated request we let the caller
    // retry with latest; when we got here from `latest` itself, it's truly
    // unsupported.
    const error = new FxRateError(
      'unsupported_currency',
      `frankfurter 404 for ${fromCode}->${toCode} (${path})`,
      404,
    );
    return { kind: path === 'latest' ? 'error' : 'date_out_of_range', error };
  }
  if (!resp.ok) {
    return {
      kind: 'error',
      error: new FxRateError('transient', `frankfurter status ${resp.status}`, resp.status),
    };
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch (cause) {
    return {
      kind: 'error',
      error: new FxRateError('bad_payload', `frankfurter bad json: ${String(cause)}`),
    };
  }

  const rate = readRate(payload, toCode);
  if (rate === null) {
    return {
      kind: 'error',
      error: new FxRateError(
        'unsupported_currency',
        `frankfurter response missing ${toCode} rate for ${fromCode}`,
      ),
    };
  }
  return { kind: 'rate', rate };
}

function readRate(payload: unknown, toCode: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const rates = (payload as { rates?: unknown }).rates;
  if (!rates || typeof rates !== 'object') return null;
  const value = (rates as Record<string, unknown>)[toCode];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
