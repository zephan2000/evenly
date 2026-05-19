# AI prompts

Authoritative source for every prompt sent to Gemini (or fallback). When you change a prompt, update this doc in the same commit.

## Provider chain

1. **Primary:** Gemini 2.0 Flash via OpenRouter (`google/gemini-2.0-flash-001`). Single SDK + single API key (`OPENROUTER_API_KEY`). Low-cost paid model billed via OpenRouter credit (~fractions of a cent per receipt). NOTE: the old `google/gemini-2.0-flash-exp` (free, experimental) was **retired by OpenRouter** (404 "No endpoints found"), which silently broke all extraction — use the GA `-001` id, never `-exp`.
2. **Fallback:** Qwen2.5-VL-72B via OpenRouter (`qwen/qwen2.5-vl-72b-instruct`). Triggered on rate limit (429) or 5xx after 1 retry.
3. **Last resort:** Surface error to user with "AI extraction unavailable, please enter manually."

Implementation: `lib/ai/extract.ts`. The fallback chain is wrapped in a single function that returns `Result<ExtractedExpense, ExtractionError>`.

**Provider-shared-failure caveat:** primary and fallback both go through OpenRouter, so an OpenRouter outage takes both down (see ADR 0002 revision 2026-05-04). The "last resort" path — manual entry — is the only remaining option in that case.

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
3. If tax_mode = "inclusive", subtotal_cents represents the line items as displayed (already including tax). tax_amount_cents is the embedded tax amount, computed as total - total/(1+tax_rate). If the tax rate is unclear, set tax_amount_cents to 0 and explain in notes. Singapore GST is 9% (effective 2024-01-01); use that as the default rate when SGD + GST signals are present and no other rate is stated.
4. service_charge is mandatory restaurant fees (typically 10% in Singapore). tip is voluntary. Do not conflate.
5. Currency: infer from symbols ($, S$, RM, ¥, €, £, ₫, ₩) and merchant location hints. If genuinely ambiguous, pick the most likely and mention in notes.
6. MINOR UNITS — every `*_cents` field is the amount in the currency's minor unit. 2-decimal currencies (SGD/USD/EUR/MYR/GBP/AUD/THB/PHP/INR/IDR/…) × 100 ($14.26 → 1426). ZERO-DECIMAL currencies with no fractional unit (JPY/KRW/VND/CLP/ISK) use the printed amount EXACTLY, NO ×100 (₫562,000 → 562000, ¥1,200 → 1200, NOT 56200000 / 120000). This rule exists because the model intermittently appended two zeros to zero-decimal amounts (it dutifully "converted to cents"); the pipeline stores `*_cents` verbatim as minor units so the inflation surfaced as expenses 100× too large.
7. Items: extract every line item. If items are not itemized (e.g., total-only receipt), return an empty array and rely on subtotal/total.
8. Confidence: be honest. If the image is blurry or partial, drop overall to <0.6 so the UI can flag for review.
9. Return ONLY the JSON object. No code fences. No "Here is the extraction:" prefix.
```

### Validation (server-side, before persisting)

- JSON.parse must succeed; if not → fallback or surface error.
- Zod schema validation in `lib/ai/schema.ts`.
- **Collapse `tax_mode = "none"` → `"inclusive"` with `tax_amount_cents = 0`** before persisting. The DB column (`expenses.tax_mode`) only carries `'inclusive' | 'exclusive'` (see `docs/data-model.md`); the AI's three-way classification is internal to the parser. Math invariant after collapse remains `subtotal + service + tip + tax ≈ total` within 1¢; for the collapsed case, tax = 0 so it reduces to `subtotal + service + tip ≈ total`.
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
- **2026-05-04** — Parser now collapses `tax_mode = "none"` → `"inclusive"` with `tax_amount_cents = 0` before persisting, so the DB enum stays two-valued (`inclusive | exclusive`). Added explicit SG GST default rate (9%) for inclusive-mode embedded-tax math when no rate is stated.
- **2026-05-04** — Provider chain now routes Gemini Flash through OpenRouter (was direct Google AI Studio API). See ADR 0002 revision for rationale and the single-provider-failure tradeoff.
- **2026-05-18** — Primary model id `google/gemini-2.0-flash-exp` → `google/gemini-2.0-flash-001`. OpenRouter retired the experimental model (404 "No endpoints found"); extraction had been silently failing in prod (upload 200, `/api/extract` 502, draft → "Couldn't read this receipt", nothing saved). Also fixed `lib/ai/extract.ts` `tryProvider` mislabeling a fatal 4xx as `transient`, which masked the dead model as a generic `provider_unavailable`/429; a fatal primary now falls through to the fallback and the real `lastStatus` is surfaced. No prompt/schema change.
- **2026-05-18** — Added CRITICAL RULE 6 (minor units / zero-decimal currencies). The model intermittently appended two trailing zeros to zero-decimal-currency amounts (JPY/KRW/VND/CLP/ISK) — it treated `*_cents` literally as "cents" and ×100'd currencies that have no fractional unit. The pipeline stores `*_cents` verbatim as minor units (`lib/fx/currency.ts` decimals are ISO-correct; no code ×100), so the inflation surfaced as expenses 100× too large (e.g. ₫562,000 → ₫56,200,000). Prompt now states explicitly: 2-decimal → ×100; zero-decimal → printed amount as-is, with worked examples. Schema/parser unchanged.

## Testing

- Snapshot tests in `lib/ai/__tests__/extract.test.ts` use fixtures in `lib/ai/__tests__/fixtures/` (receipts cover: SG GST-exclusive restaurant, SG GST-inclusive hawker, JP receipt no tax, US receipt with tip, blurry edge case).
- Run with `npm test`.
- Do NOT commit real receipt images with personal info to fixtures. Use synthetic or scrubbed examples.
