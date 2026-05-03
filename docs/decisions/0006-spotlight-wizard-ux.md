# 0006 — Spotlight wizard for bill splitting

**Status:** Accepted (2026-05-03)

## Context

Splitwise/Tricount use multi-screen sequential wizards to split bills (one screen per person). On a 4-person dinner with 25 line items, that's tedious. Most items are shared, so per-person assignment is overkill for the common case.

## Decision

A single-screen, vertically-stacked wizard with **opacity gradient** indicating progress:

- Active step: 100% opacity, accent border, slight scale-up (1.02), subtle shadow.
- Completed steps: 70% opacity, no border, tappable to revisit (becomes active on tap).
- Future steps: 30% opacity, non-interactive.

Transitions: 200ms ease-out on opacity + transform.

### Step model

```ts
type WizardStep = {
  id: string;
  status: 'future' | 'active' | 'completed';
};
```

`currentStepId` is explicit state, not derived from focus. Steps update via `setCurrentStep(id)`.

### Mobile collapse

On viewports <600px, non-active steps collapse to a single-line summary. Tap to expand & become active.

### Auto-advance

When a step is unambiguously complete (all required fields filled, or user taps "Done"), advance automatically. Don't require an explicit "Next" button when the completion signal is clear.

## Splitting flow specifics

- **Step 1 — Share groups.** User identifies items that split equally (e.g., "starters: all 4", "wine: Z+A"). Default: every item in "all members" share group.
- **Step 2..N — Per-person panels.** For items NOT covered by a share group, assign per person. AI suggests defaults from group history (e.g., "Alika usually has her own main").
- Tax & service distribute proportionally — user never assigns them manually.

## Consequences

- Reusable spotlight primitives live in `lib/ux/spotlight/`. Use them for any sequential flow.
- Forbidden: multi-screen wizards for a single task. If you find yourself wanting one, reach for spotlight first.
- Tested at 375×667 viewport before any other size.
- AI-suggested defaults require historical data; first-trip experience falls back to "split equally among all" defaults.
