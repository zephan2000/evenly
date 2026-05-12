import { describe, expect, it, vi } from 'vitest';

import { FxRateError, fetchFxRate } from '../rates';

function makeFetch(
  handler: (
    url: string,
  ) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const { status, body } = await handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('fetchFxRate', () => {
  it('short-circuits same-currency to rate 1 / fresh without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchFxRate('SGD', 'SGD', undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ rate: 1, status: 'fresh' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a fresh rate from frankfurter latest endpoint', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/latest?from=VND&to=SGD');
      return { status: 200, body: { rates: { SGD: 0.0000537 } } };
    });
    const result = await fetchFxRate('vnd', 'sgd', undefined, { fetchImpl });
    expect(result).toEqual({ rate: 0.0000537, status: 'fresh' });
  });

  it('uses the date path when given a valid ISO date', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/2026-05-10?from=USD&to=SGD');
      return { status: 200, body: { rates: { SGD: 1.35 } } };
    });
    const result = await fetchFxRate('USD', 'SGD', '2026-05-10', { fetchImpl });
    expect(result.rate).toBe(1.35);
  });

  it('throws unsupported_currency on 404', async () => {
    const fetchImpl = makeFetch(() => ({ status: 404, body: { message: 'not found' } }));
    await expect(fetchFxRate('XYZ', 'SGD', undefined, { fetchImpl })).rejects.toMatchObject({
      name: 'FxRateError',
      kind: 'unsupported_currency',
    });
  });

  it('throws unsupported_currency when payload omits the target rate', async () => {
    const fetchImpl = makeFetch(() => ({ status: 200, body: { rates: {} } }));
    await expect(fetchFxRate('USD', 'SGD', undefined, { fetchImpl })).rejects.toBeInstanceOf(
      FxRateError,
    );
  });

  it('throws transient on 5xx', async () => {
    const fetchImpl = makeFetch(() => ({ status: 503, body: {} }));
    await expect(fetchFxRate('USD', 'SGD', undefined, { fetchImpl })).rejects.toMatchObject({
      kind: 'transient',
      status: 503,
    });
  });

  it('throws transient on network error', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    await expect(fetchFxRate('USD', 'SGD', undefined, { fetchImpl })).rejects.toMatchObject({
      kind: 'transient',
    });
  });

  it('falls back from dated 404 to latest, returning stale', async () => {
    // Out-of-range dated request — e.g. a future-dated receipt or a date
    // before frankfurter's data range. We should fall through to /latest
    // and tag the result as stale so the UI can flag it.
    const fetchImpl = makeFetch((url) => {
      if (url.includes('/2099-04-29')) return { status: 404, body: { message: 'not found' } };
      if (url.includes('/latest')) return { status: 200, body: { rates: { SGD: 1.35 } } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    const result = await fetchFxRate('USD', 'SGD', '2099-04-29', { fetchImpl });
    expect(result).toEqual({ rate: 1.35, status: 'stale' });
  });

  it('throws when both the dated request and the latest fallback 404', async () => {
    const fetchImpl = makeFetch(() => ({ status: 404, body: { message: 'not found' } }));
    await expect(fetchFxRate('XYZ', 'SGD', '2026-05-10', { fetchImpl })).rejects.toMatchObject({
      name: 'FxRateError',
      kind: 'unsupported_currency',
    });
  });
});
