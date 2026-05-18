import { describe, expect, it, vi } from 'vitest';
import { extractReceipt, postProcess } from '../extract';
import type { ExtractedExpense } from '../schema';

const sgGstExclusive: ExtractedExpense = {
  merchant: 'Hawker Heaven',
  expense_date: '2026-05-04',
  currency: 'SGD',
  tax_mode: 'exclusive',
  tax_label: 'GST',
  items: [
    { name: 'Chicken Rice', quantity: 2, unit_amount_cents: 600, amount_cents: 1200 },
    { name: 'Iced Milo', quantity: 2, unit_amount_cents: 250, amount_cents: 500 },
  ],
  subtotal_cents: 1700,
  service_charge_cents: 170,
  tip_cents: 0,
  tax_amount_cents: 168,
  total_cents: 2038,
  category_guess: 'meals',
  confidence: { overall: 0.92, items: 0.9, totals: 0.95 },
  notes: '',
};

function mockJsonResponse(payload: unknown, status = 200) {
  const body = {
    choices: [{ message: { content: JSON.stringify(payload) } }],
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockTransientResponse(status: number) {
  return new Response('upstream error', { status });
}

describe('extractReceipt', () => {
  it('returns a parsed expense on a clean primary call', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(mockJsonResponse(sgGstExclusive));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.merchant).toBe('Hawker Heaven');
    expect(result.value.tax_mode).toBe('exclusive');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the secondary model after primary 429s twice (initial + retry)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockTransientResponse(429))
      .mockResolvedValueOnce(mockTransientResponse(429))
      .mockResolvedValueOnce(mockJsonResponse(sgGstExclusive));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
  });

  it('returns provider_unavailable when both providers fail with transient errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockTransientResponse(503));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('provider_unavailable');
  });

  it('falls back to the secondary model when the primary id is retired (404 fatal)', async () => {
    // Regression: google/gemini-2.0-flash-exp was removed from OpenRouter
    // (404 "No endpoints found"). A fatal 404 on the primary must not be
    // retried and must fall through to the fallback, not take extraction down.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockTransientResponse(404))
      .mockResolvedValueOnce(mockJsonResponse(sgGstExclusive));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // primary 404 (no retry) + fallback
    expect(result.ok).toBe(true);
  });

  it('returns provider_unavailable when both model ids are dead (404)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockTransientResponse(404));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('provider_unavailable');
    if (result.error.kind !== 'provider_unavailable') return;
    expect(result.error.lastStatus).toBe(404); // real cause surfaced, not masked as 429
  });

  it('returns missing_api_key when no key is provided and env is empty', async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const result = await extractReceipt({ imageDataUrl: 'data:image/png;base64,xxx' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('missing_api_key');
    } finally {
      if (original !== undefined) process.env.OPENROUTER_API_KEY = original;
    }
  });

  it('surfaces parse_error when the model returns invalid JSON', async () => {
    const body = { choices: [{ message: { content: 'not json {' } }] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    const result = await extractReceipt({
      imageDataUrl: 'data:image/png;base64,xxx',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('parse_error');
  });
});

describe('postProcess', () => {
  it("collapses tax_mode 'none' to 'inclusive' with tax_amount_cents = 0", () => {
    const input: ExtractedExpense = {
      ...sgGstExclusive,
      tax_mode: 'none',
      tax_label: '',
      tax_amount_cents: 42,
      subtotal_cents: 2038,
      service_charge_cents: 0,
      tip_cents: 0,
      total_cents: 2038,
    };
    const out = postProcess(input);
    expect(out.tax_mode).toBe('inclusive');
    expect(out.tax_amount_cents).toBe(0);
  });

  it('downgrades confidence and annotates notes when math invariant fails', () => {
    const broken: ExtractedExpense = {
      ...sgGstExclusive,
      subtotal_cents: 1000,
      service_charge_cents: 100,
      tip_cents: 0,
      tax_amount_cents: 90,
      total_cents: 9999,
      confidence: { overall: 0.95, items: 0.9, totals: 0.95 },
      notes: '',
    };
    const out = postProcess(broken);
    expect(out.confidence.overall).toBeLessThanOrEqual(0.5);
    expect(out.notes).toMatch(/Math invariant failed/);
  });

  it('passes through a math-consistent inclusive receipt unchanged', () => {
    const input: ExtractedExpense = {
      ...sgGstExclusive,
      tax_mode: 'inclusive',
      subtotal_cents: 2038,
      service_charge_cents: 0,
      tip_cents: 0,
      tax_amount_cents: 168,
      total_cents: 2206,
    };
    const out = postProcess(input);
    expect(out.tax_mode).toBe('inclusive');
    expect(out.confidence.overall).toBeCloseTo(0.92);
    expect(out.notes).toBe('');
  });
});
