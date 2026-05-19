// Server-only. Do not import from client components or screens.
// Called from `app/api/*` route handlers. See ADR 0002 and docs/ai-prompts.md.

import {
  ExtractedExpenseSchema,
  PersistedExpenseSchema,
  type ExtractedExpense,
  type PersistedExpense,
} from './schema';

// google/gemini-2.0-flash-exp was retired by OpenRouter (returns 404 "No
// endpoints found"), which silently broke all extraction. -001 is the GA
// id of the same Gemini 2.0 Flash model (ADR 0002); verified live.
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = 'qwen/qwen2.5-vl-72b-instruct';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are a receipt extraction service. Given a receipt image, return STRICT JSON with no prose, no markdown fences, no explanations. The JSON must match this TypeScript type:

type ExtractedExpense = {
  merchant: string;
  expense_date: string;          // ISO date "YYYY-MM-DD". If absent, return today.
  currency: string;              // ISO 4217. Infer from currency symbols and country hints.
  tax_mode: "inclusive" | "exclusive" | "none";
  tax_label: string;             // "GST", "VAT", "Sales Tax", "Service Tax", or "" if none.
  items: Array<{
    name: string;
    quantity: number;
    unit_amount_cents: number;   // minor units of \`currency\`
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
6. MINOR UNITS — every \`*_cents\` field is the amount in the currency's minor unit:
   - 2-decimal currencies (SGD, USD, EUR, MYR, GBP, AUD, THB, PHP, INR, IDR, …): multiply by 100. $14.26 → 1426. RM 8.50 → 850.
   - ZERO-DECIMAL currencies with NO fractional unit (JPY, KRW, VND, CLP, ISK and similar): the minor unit IS the whole unit — use the printed amount EXACTLY, with NO ×100. ¥1,200 → total_cents 1200 (NOT 120000). ₫562,000 → total_cents 562000 (NOT 56200000). ₩9,000 → 9000. Never append trailing zeros that are not on the receipt.
   When unsure whether a currency is zero-decimal, JPY/KRW/VND/CLP/ISK are zero-decimal; assume 2 decimals otherwise.
7. Items: extract every line item. If items are not itemized (e.g., total-only receipt), return an empty array and rely on subtotal/total.
8. Confidence: be honest. If the image is blurry or partial, drop overall to <0.6 so the UI can flag for review.
9. Return ONLY the JSON object. No code fences. No "Here is the extraction:" prefix.`;

export type ExtractionError =
  | { kind: 'missing_api_key' }
  | { kind: 'provider_unavailable'; primary: string; fallback: string; lastStatus?: number }
  | { kind: 'parse_error'; raw: string; provider: string }
  | { kind: 'schema_error'; issues: unknown; provider: string };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type ExtractInput = {
  imageDataUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export async function extractReceipt(
  input: ExtractInput,
): Promise<Result<PersistedExpense, ExtractionError>> {
  const apiKey = input.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: { kind: 'missing_api_key' } };

  const fetchFn = input.fetchImpl ?? fetch;

  const primary = await tryProvider(PRIMARY_MODEL, input.imageDataUrl, apiKey, fetchFn, 1);
  if (primary.ok) return { ok: true, value: postProcess(primary.value) };
  // parse/schema = the model answered but badly → terminal, no fallback.
  // transient/fatal (incl. a 404 dead model) → try the fallback so a
  // retired primary id can't take extraction down on its own.
  if (primary.error.kind === 'parse' || primary.error.kind === 'schema') {
    return mapTerminalError(primary.error, PRIMARY_MODEL);
  }

  const fallback = await tryProvider(FALLBACK_MODEL, input.imageDataUrl, apiKey, fetchFn, 0);
  if (fallback.ok) return { ok: true, value: postProcess(fallback.value) };
  if (fallback.error.kind === 'parse' || fallback.error.kind === 'schema') {
    return mapTerminalError(fallback.error, FALLBACK_MODEL);
  }

  return {
    ok: false,
    error: {
      kind: 'provider_unavailable',
      primary: PRIMARY_MODEL,
      fallback: FALLBACK_MODEL,
      lastStatus: fallback.error.status,
    },
  };
}

type ProviderAttemptError =
  | { kind: 'transient'; status: number } // 429/5xx — retry, then try fallback
  | { kind: 'fatal'; status: number } // 4xx (404 dead model, 401, 400) — try fallback, don't retry
  | { kind: 'parse'; raw: string }
  | { kind: 'schema'; issues: unknown };

async function tryProvider(
  model: string,
  imageDataUrl: string,
  apiKey: string,
  fetchFn: typeof fetch,
  retries: number,
): Promise<Result<ExtractedExpense, ProviderAttemptError>> {
  let attempt = 0;
  while (true) {
    const resp = await callOpenRouter(model, imageDataUrl, apiKey, fetchFn);
    if (resp.kind === 'ok') {
      const parsed = parseAndValidate(resp.content);
      return parsed;
    }
    if (resp.kind === 'transient' && attempt < retries) {
      attempt++;
      continue;
    }
    // Preserve the real failure kind. Previously this always returned
    // 'transient', so a fatal 404 (retired model id) was mislabeled and
    // surfaced as a generic provider_unavailable/429 — masking the true
    // cause for a long time.
    return { ok: false, error: { kind: resp.kind, status: resp.status } };
  }
}

type OpenRouterResult =
  | { kind: 'ok'; content: string }
  | { kind: 'transient'; status: number }
  | { kind: 'fatal'; status: number };

async function callOpenRouter(
  model: string,
  imageDataUrl: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<OpenRouterResult> {
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  };

  let resp: Response;
  try {
    resp = await fetchFn(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://evenly.app',
        'X-Title': 'Evenly',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: 'transient', status: 0 };
  }

  if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
    return { kind: 'transient', status: resp.status };
  }
  if (!resp.ok) {
    return { kind: 'fatal', status: resp.status };
  }

  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return { kind: 'fatal', status: 0 };
  }
  return { kind: 'ok', content };
}

function parseAndValidate(raw: string): Result<ExtractedExpense, ProviderAttemptError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { kind: 'parse', raw } };
  }
  const result = ExtractedExpenseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: { kind: 'schema', issues: result.error.issues } };
  }
  return { ok: true, value: result.data };
}

type TerminalAttemptError = Extract<ProviderAttemptError, { kind: 'parse' } | { kind: 'schema' }>;

function mapTerminalError(
  err: TerminalAttemptError,
  provider: string,
): Result<PersistedExpense, ExtractionError> {
  if (err.kind === 'parse') {
    return { ok: false, error: { kind: 'parse_error', raw: err.raw, provider } };
  }
  return { ok: false, error: { kind: 'schema_error', issues: err.issues, provider } };
}

export function postProcess(raw: ExtractedExpense): PersistedExpense {
  const collapsed: ExtractedExpense =
    raw.tax_mode === 'none' ? { ...raw, tax_mode: 'inclusive', tax_amount_cents: 0 } : raw;

  const sum =
    collapsed.subtotal_cents +
    collapsed.service_charge_cents +
    collapsed.tip_cents +
    collapsed.tax_amount_cents;
  const drift = Math.abs(sum - collapsed.total_cents);

  let next = collapsed;
  if (drift > 1) {
    const addendum = `Math invariant failed: subtotal+service+tip+tax=${sum} vs total=${collapsed.total_cents} (drift ${drift}¢).`;
    next = {
      ...collapsed,
      confidence: {
        ...collapsed.confidence,
        overall: Math.min(0.5, collapsed.confidence.overall),
      },
      notes: collapsed.notes ? `${collapsed.notes} ${addendum}` : addendum,
    };
  }

  return PersistedExpenseSchema.parse(next);
}
