# 0002 — Vision model: Gemini 2.0 Flash (with Qwen2.5-VL fallback)

**Status:** Accepted (2026-05-03)

## Context

Receipt extraction needs a vision-capable model. Constraints:

- Free for development (low/no daily volume)
- Hostable from Vercel API routes (no self-hosting)
- Strong on receipt OCR + structured JSON output

## Options considered

| Model                                  | Free tier                       | Open-source      | Receipt quality           | Hostable on Vercel        |
| -------------------------------------- | ------------------------------- | ---------------- | ------------------------- | ------------------------- |
| Gemini 2.0 Flash                       | 1500 req/day                    | No               | Excellent                 | Yes (REST)                |
| Qwen2.5-VL-72B (Hyperbolic/OpenRouter) | Limited                         | Yes (Apache 2.0) | Very good                 | Yes (REST)                |
| Qwen2.5-VL-7B (HF Inference)           | Yes (rate-limited, cold starts) | Yes              | Good                      | Yes (REST)                |
| Tesseract.js (client)                  | Free                            | Yes              | Mediocre on thermal paper | N/A (client)              |
| Self-hosted Llama 3.2 Vision           | N/A                             | Yes              | Good                      | **No** (no GPU on Vercel) |

## Decision

**Primary model:** Gemini 2.0 Flash. Generous free tier, best receipt quality observed in our use case, easy structured output.

**Primary access path (revised 2026-05-04):** OpenRouter (`google/gemini-2.0-flash-exp`). See revision note below.

**Fallback:** Qwen2.5-VL-72B via OpenRouter. Triggered on 429/5xx from the primary call after 1 retry.

**Rationale for not picking open-source primary:** the user's preference for open-source was _cost-driven_, not principled. Gemini Flash is currently free and better than Qwen2.5-VL on receipts. If Google's pricing changes, we revisit and likely flip primary/fallback.

## Revision — 2026-05-04: route Gemini through OpenRouter

We now access Gemini 2.0 Flash via **OpenRouter** instead of the direct Google AI Studio API.

**Why:**

- One SDK, one auth surface, one billing dashboard (`OPENROUTER_API_KEY`).
- Easier to A/B-test models (swap `google/gemini-2.0-flash-exp` for `qwen/qwen2.5-vl-72b-instruct` by changing a string).
- Removes the Google-specific dependency from `lib/ai/extract.ts`.

**Tradeoff (explicit):** primary and fallback now share a single upstream provider. An OpenRouter outage takes both down. Previously the direct Gemini path + OpenRouter Qwen path gave us two independent providers. We accept this for MVP because OpenRouter's reliability has been adequate; if we see provider-level outages bite users, the mitigation is to add a second provider for the fallback (Hyperbolic for Qwen, or restore direct Gemini) rather than reverting the primary path.

**Env var implications:**

- `OPENROUTER_API_KEY` is now required (was optional under the original ADR).
- `GEMINI_API_KEY` is no longer used by `lib/ai/extract.ts`. Kept in `.env.example` as commented-out / optional for the day we want a second-provider fallback.

## Consequences

- `lib/ai/extract.ts` calls OpenRouter for both primary and fallback; no direct `@google/generative-ai` dependency in MVP.
- Single point of failure noted above; revisit if outages become user-visible.
- If we ever need fully on-device extraction (privacy, offline), Qwen2.5-VL-7B compiled to MLC or ONNX is the path — not Gemini.
- We track OpenRouter usage to warn before any per-key limits bite (Gemini's free-tier 1500/day is enforced upstream by Google through OpenRouter).
