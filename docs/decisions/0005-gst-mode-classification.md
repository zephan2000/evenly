# 0005 — AI classifies GST mode before extracting values

**Status:** Accepted (2026-05-03)

## Context

Singapore receipts come in two flavors:

- **GST-exclusive:** subtotal + service charge (10%) + GST (9%) = total. Service is applied before GST.
- **GST-inclusive:** prices already include GST; receipt may say "GST included" or have no separate tax line.

Extracting `subtotal`, `service`, `tax`, `total` correctly requires knowing which mode the receipt uses, because the math is different.

## Decision

The vision model's first job is to **classify the receipt's tax mode** based on textual signals on the receipt itself:

- Explicit "GST included" → inclusive
- Separate GST/service lines summing to total → exclusive
- No tax mention → none

The classification is part of the JSON output (`tax_mode` field) and drives validation:

- `exclusive`: validate `subtotal + service + tip + tax ≈ total`
- `inclusive`: subtotal already includes tax; validate `subtotal + tip ≈ total` (service usually doesn't appear on inclusive receipts)
- `none`: validate `subtotal + tip ≈ total`

If the classification is wrong, the user can override `tax_mode` in the expense edit form, which re-validates the math.

## Consequences

- The Gemini prompt (`docs/ai-prompts.md`) includes explicit classification rules.
- The expense edit UI shows `tax_mode` as a tri-state toggle (inclusive/exclusive/none) so users can correct misclassifications.
- Service charge and tip are stored as separate fields, never conflated. SG service charge is mandatory; tip is voluntary (rare in SG, common in US/EU).
- Distribution math (in `lib/gst/`) takes `tax_mode` as input and applies the correct formula.
