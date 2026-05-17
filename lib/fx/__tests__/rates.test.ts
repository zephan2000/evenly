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

  it('returns a fresh rate from the exchangerate-api latest endpoint', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/v6/latest/VND');
      return {
        status: 200,
        body: { result: 'success', base_code: 'VND', rates: { SGD: 0.0000537 } },
      };
    });
    const result = await fetchFxRate('vnd', 'sgd', undefined, { fetchImpl });
    expect(result).toEqual({ rate: 0.0000537, status: 'fresh' });
  });

  it('covers VND (the gap that motivated dropping frankfurter)', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/v6/latest/SGD');
      return {
        status: 200,
        body: { result: 'success', base_code: 'SGD', rates: { VND: 20421.46 } },
      };
    });
    const result = await fetchFxRate('SGD', 'VND', undefined, { fetchImpl });
    expect(result).toEqual({ rate: 20421.46, status: 'fresh' });
  });

  it('free tier is latest-only: a dated request still returns the fresh latest rate', async () => {
    const fetchImpl = makeFetch((url) => {
      // No dated endpoint — always /latest/<BASE>, never a date path.
      expect(url).toContain('/v6/latest/USD');
      expect(url).not.toContain('2026-05-10');
      return { status: 200, body: { result: 'success', base_code: 'USD', rates: { SGD: 1.35 } } };
    });
    const result = await fetchFxRate('USD', 'SGD', '2026-05-10', { fetchImpl });
    expect(result).toEqual({ rate: 1.35, status: 'fresh' });
  });

  it('throws unsupported_currency on 404 (unknown base)', async () => {
    const fetchImpl = makeFetch(() => ({ status: 404, body: { result: 'error' } }));
    await expect(fetchFxRate('XYZ', 'SGD', undefined, { fetchImpl })).rejects.toMatchObject({
      name: 'FxRateError',
      kind: 'unsupported_currency',
    });
  });

  it('throws unsupported_currency on a typed error result (HTTP 200)', async () => {
    const fetchImpl = makeFetch(() => ({
      status: 200,
      body: { result: 'error', 'error-type': 'unsupported-code' },
    }));
    await expect(fetchFxRate('USD', 'XYZ', undefined, { fetchImpl })).rejects.toMatchObject({
      name: 'FxRateError',
      kind: 'unsupported_currency',
    });
  });

  it('throws unsupported_currency when payload omits the target rate', async () => {
    const fetchImpl = makeFetch(() => ({
      status: 200,
      body: { result: 'success', rates: {} },
    }));
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

  it('throws bad_payload on non-JSON 2xx', async () => {
    const fetchImpl = (async () =>
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    await expect(fetchFxRate('USD', 'SGD', undefined, { fetchImpl })).rejects.toMatchObject({
      kind: 'bad_payload',
    });
  });
});
