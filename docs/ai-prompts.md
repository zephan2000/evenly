# AI prompts

Authoritative source for every prompt sent to Gemini (or fallback). When you change a prompt, update this doc in the same commit.

## Provider chain

1. **Primary:** Gemini 2.0 Flash (`gemini-2.0-flash-exp`) via `@google/generative-ai`. Free tier: 1500 req/day per key.
2. **Fallback:** Qwen2.5-VL-72B via OpenRouter or Hyperbolic. Triggered on rate limit (429) or 5xx after 1 retry.
3. **Last resort:** Surface error to user with "AI extraction unavailable, please enter manually."

Implementation: `lib/ai/extract.ts`. The fallback chain is wrapped in a single function that returns `Result<ExtractedExpense, ExtractionError>`.

## Prompt 1 — Receipt extraction

**Input:** receipt image (base64 inline or URL).
**Output:** strict JSON matching `ExtractedExpenseSchema` (see `lib/ai/schema.ts`).

### System prompt

```
You are a receipt extraction service. Given a receipt image, return STRICT JSON with no prose, no markdown fences, no explanations. The JSON must match this TypeScript type:

type ExtractedExpense = {
  merchant: string;
  expense_date: string;          // ISO date "YYYY-MM-DD". If absent, return today.
  currency: string;              // ISO 4217. Infer from currency symbols and country hints.
  tax_mode: "inclusive" | "exclusive" | "none";
  tax_label: string;             // "GST", "VAT", "Sales Tax", "Service Tax", or "" if none.
  items: Array<{
    name: string;
    quantity: number;
    unit_amount_cents: number;   // minor units of `currency`
    amount_cents: number;        // quantity × unit_amount, in minor units
  }>;
  subtotal_cents: number;        // pre-tax, pre-service, in minor units
  service_charge_cents: number;  // 0 if absent
  tip_cents: number;             // 0 if absent. Distinct from service_charge.
  tax_amount_cents: number;      // 0 if tax_mode = "none"
  total_cents: number;
  category_guess: "meals" | "transport" | "lodging" | "entertainment" | "groceries" | "shopping" | "other";
  confidence: {
    overall: number;             // 0..1
    items: number;               // 0..1, lower if line items are ambiguous
    totals: number;              // 0..1
  };
  notes: string;                 // optional human-readable caveats, e.g. "Service charge inferred from total."
};

CRITICAL RULES:
1. tax_mode classification:
   - "inclusive" if the receipt explicitly states GST/VAT is included in the displayed prices, or if there is no separate tax line but there is a tax mention.
   - "exclusive" if there is a separate line itemizing GST/VAT/Service Tax added on top.
   - "none" if no tax appears anywhere.
2. If tax_mode = "exclusive", subtotal_cents + service_charge_cents + tip_cents + tax_amount_cents MUST equal total_cents (within 1 cent).
3. If tax_mode = "inclusive", subtotal_cents represents the line items as displayed (already including tax). tax_amount_cents is the embedded tax amount, computed as total - total/(1+tax_rate). If tax rate is unclear, set tax_amount_cents to 0 and set notes accordingly.
4. service_charge is mandatory restaurant fees (typically 10% in Singapore). tip is voluntary. Do not conflate.
5. Currency: infer from symbols ($, S$, RM, ¥, €, £) and merchant location hints. If genuinely ambiguous, pick the most likely and mention in notes.
6. Items: extract every line item. If items are not itemized (e.g., total-only receipt), return an empty array and rely on subtotal/total.
7. Confidence: be honest. If the image is blurry or partial, drop overall to <0.6 so the UI can flag for review.
8. Return ONLY the JSON object. No code fences. No "Here is the extraction:" prefix.
```

### Validation (server-side, before persisting)

- JSON.parse must succeed; if not → fallback or surface error.
- Zod schema validation in `lib/ai/schema.ts`.
- Math check: `subtotal + service + tip + tax ≈ total` within 1¢. If fails, set `confidence.overall = min(0.5, confidence.overall)` and flag `notes`.
- Currency must be a valid ISO 4217 code. If unknown, default to trip's home currency and flag.

## Prompt 2 — Voice expense capture (post-MVP)

**Input:** transcribed voice note text (Whisper output).
**Output:** same `ExtractedExpense` shape, with empty `items[]` and best-effort totals.

Not implemented yet. Will be added in v1.1.

## Prompt versioning

When you change a prompt:

1. Update the section above.
2. Add an entry to the changelog below with date and rationale.
3. If the JSON shape changed, bump the schema version in `lib/ai/schema.ts` and update `ExtractedExpenseSchema`.

## Changelog

- **2026-05-03** — Initial prompt drafted. Covers SG GST inclusive/exclusive classification + multi-currency.

## Testing

- Snapshot tests in `lib/ai/__tests__/extract.test.ts` use fixtures in `lib/ai/__tests__/fixtures/` (receipts cover: SG GST-exclusive restaurant, SG GST-inclusive hawker, JP receipt no tax, US receipt with tip, blurry edge case).
- Run with `npm test`.
- Do NOT commit real receipt images with personal info to fixtures. Use synthetic or scrubbed examples.
