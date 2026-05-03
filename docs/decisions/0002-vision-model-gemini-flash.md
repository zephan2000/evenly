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

**Primary:** Gemini 2.0 Flash. Generous free tier, best receipt quality observed in our use case, easy structured output.

**Fallback:** Qwen2.5-VL-72B via OpenRouter (or Hyperbolic). Triggered on Gemini 429/5xx after 1 retry.

**Rationale for not picking open-source primary:** the user's preference for open-source was _cost-driven_, not principled. Gemini Flash is currently free and better than Qwen2.5-VL on receipts. If Google's pricing changes, we revisit and likely flip primary/fallback.

## Consequences

- Gemini API key is not portable (vendor lock for primary path).
- Fallback chain adds complexity in `lib/ai/extract.ts`. Worth it for resilience.
- If we ever need fully on-device extraction (privacy, offline), Qwen2.5-VL-7B compiled to MLC or ONNX is the path — not Gemini.
- We track Gemini quota usage so we can warn users before hitting the daily limit.
