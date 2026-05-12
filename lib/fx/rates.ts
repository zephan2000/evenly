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
  const path = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'latest';
  const url = `${FRANKFURTER_BASE}/${path}?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`;

  let resp: Response;
  try {
    resp = await fetchFn(url, { method: 'GET' });
  } catch (cause) {
    throw new FxRateError('transient', `fx fetch network error: ${String(cause)}`);
  }

  if (resp.status === 404) {
    // Frankfurter returns 404 for unsupported currency pairs.
    throw new FxRateError(
      'unsupported_currency',
      `frankfurter 404 for ${fromCode}->${toCode}`,
      404,
    );
  }
  if (!resp.ok) {
    throw new FxRateError('transient', `frankfurter status ${resp.status}`, resp.status);
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch (cause) {
    throw new FxRateError('bad_payload', `frankfurter bad json: ${String(cause)}`);
  }

  const rate = readRate(payload, toCode);
  if (rate === null) {
    // Some unsupported codes return 200 with the requested currency missing
    // from `rates` — treat that the same as a 404.
    throw new FxRateError(
      'unsupported_currency',
      `frankfurter response missing ${toCode} rate for ${fromCode}`,
    );
  }
  return { rate, status: 'fresh' };
}

function readRate(payload: unknown, toCode: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const rates = (payload as { rates?: unknown }).rates;
  if (!rates || typeof rates !== 'object') return null;
  const value = (rates as Record<string, unknown>)[toCode];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
