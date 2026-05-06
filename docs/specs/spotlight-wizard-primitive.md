# Spotlight wizard — Primitive spec

**Status:** Draft, 2026-05-07. Pending Zephan review → Codex review → implementation.

**Authors:** Claude (spec, state machine, accessibility, mobile collapse), Codex (visual polish), Zephan (product owner).

This spec describes the reusable spotlight-wizard primitive that lives in `lib/ux/`. It is the implementation of the pattern described in [docs/ux-principles.md](../ux-principles.md) §"The spotlight wizard pattern" and locked by [docs/decisions/0006-spotlight-wizard-ux.md](../decisions/0006-spotlight-wizard-ux.md).

The primitive is built once for [m2-splitting.md](./m2-splitting.md) and reused for any future sequential single-task flow. It is **not** specific to splitting.

## 0. Pending confirmations

These are intentionally **not resolved** in this draft. Surfaced for Zephan to direct before implementation.

- **Where does the primitive live?** `lib/ux/spotlight-wizard.tsx` (logic + composition) plus `components/ui/wizard-step.tsx` (presentational), or all in `lib/ux/`? Convention in this repo seems split between behavior and presentation, so this is a stylistic call.
- **API shape — controlled vs. uncontrolled?** Do consumers pass an explicit `currentStepId` and `onStepChange`, or do they pass step descriptors and let the primitive own the cursor internally? Default assumption: controlled, because consumers like splitting need to drive `currentStepId` from a reducer.
- **Animation library** — Reanimated 3 (already in tree via Expo SDK 54) or pure CSS/Animated? The opacity + scale transitions in ux-principles are 200ms ease-out; Reanimated gives smoother results, but adds a dep surface. Default assumption: Reanimated for native, CSS for web — abstract via a tiny adapter.
- **Mobile breakpoint** — ux-principles §"Mobile collapse" says <600px. Is this measured against viewport width, container width, or platform (always collapsed on native phones)? Default assumption: container width via a parent measurement, so the same primitive works on web too.
- **Step-skip semantics** — When auto-advance would land on a step that is somehow not yet renderable (e.g., its data isn't ready), do we hold on the active step until the next step becomes valid, or do we skip it? Default assumption: hold; consumer is responsible for marking a step as `future` until ready.
- **Tap-to-revisit on touch devices** — Should completed steps require an explicit affordance ("Edit" pill) or does the whole row act as a tap target? Default assumption: whole row, with a visible chevron in the collapsed summary on mobile.
- **Focus management on auto-advance** — When the wizard auto-advances, do we move screen-reader focus and visible focus to the new active step? Default assumption: yes for both, with a short polite live-region announcement.

## 1. Goal

Provide a reusable, accessible, mobile-friendly spotlight-wizard primitive that:

- Renders N stacked steps with the locked opacity gradient.
- Manages active/completed/future state cleanly via a controlled `currentStepId` API.
- Auto-advances on unambiguous completion signals.
- Allows tap-to-revisit on completed steps.
- Collapses non-active steps to one-line summaries on small viewports.
- Announces step transitions to assistive tech.

It is used at minimum by [m2-splitting.md](./m2-splitting.md) (C7 splitting wizard), and is intended for any future sequential single-task flow that follows the spotlight pattern.

## 2. Visual model

Locked by ADR 0006 and ux-principles. **Do not relitigate.**

| Step state | Opacity | Border                       | Transform     | Interactive?                         |
| ---------- | ------- | ---------------------------- | ------------- | ------------------------------------ |
| Active     | 100%    | accent border, slight shadow | `scale(1.02)` | yes                                  |
| Completed  | 70%     | none                         | `scale(1.0)`  | yes (tap to revisit, becomes active) |
| Future     | 30%     | none                         | `scale(1.0)`  | no                                   |

Transitions: 200ms ease-out on `opacity`, `transform`, `border`. Shadow uses `shadow-xs` from [docs/design-system.md](../design-system.md) §5.4 for the active step.

Codex owns the precise tokens (accent border color hex, exact shadow values) — see §10. The primitive consumes design-system tokens and does not hard-code visual values.

## 3. Step state model

Per ux-principles and ADR 0006:

```ts
type WizardStepStatus = 'future' | 'active' | 'completed';

type WizardStep = {
  id: string;
  status: WizardStepStatus;
};
```

State invariants the primitive enforces:

- Exactly **one** step is `active` at any time, unless the wizard is in the terminal "all completed" state, in which case no step is active.
- Steps with `status: 'future'` cannot be focused, tab-targeted, or tapped.
- `currentStepId` is explicit consumer state — it is never derived from "last interactive element."
- The primitive never owns `WizardStep.status`. Consumers compute step status from their domain state and pass it in.

The primitive does own:

- `currentStepId` cursor (controlled or internal — see §0).
- Animation state for transitions.
- Focus and screen-reader announcements.
- Mobile-collapse state (whether non-active steps are collapsed).

## 4. Auto-advance rules

Auto-advance fires when:

1. The active step's `status` flips to `completed`.
2. There exists at least one step after it with `status === 'future'`.

When it fires:

- The next future step becomes `active` (consumer flips `WizardStep.status` and updates `currentStepId`).
- A 200ms transition animates opacity/scale on both steps.
- Focus moves to the new active step's first focusable child.
- A polite ARIA live-region announces "Step N of M, {step title} active."

Auto-advance does **not** fire when:

- The active step's status flipped to `completed` but no future step exists (terminal "all done" state — consumer typically renders a summary or save action).
- The active step's status flipped via a tap-to-revisit (the user explicitly returned to a completed step; respect that).
- Auto-advance is disabled via a per-step `autoAdvance: false` opt-out (see §8 API).

The primitive surfaces an `onAdvance(nextStepId)` callback so the consumer can run side effects (analytics, validation) before/after the cursor moves.

## 5. Tap-to-revisit rules

A `completed` step is tappable. Tap behavior:

- The tapped step becomes `active`.
- The previously-active step's status is **not** mutated by the primitive — the consumer decides whether to flip it to `completed`, `future`, or leave it as-is.
- Focus moves into the newly-active step.
- A polite ARIA live-region announces the new active step.
- Completed steps after the newly-active one stay `completed` unless the consumer's domain state recomputes them. The primitive does not cascade-invalidate.

Tap-to-revisit is disabled when:

- The wizard is mid-save (`saving: true` prop). Tap is ignored; visual feedback is suppressed.
- A per-step `revisitable: false` is set (see §8 API).

## 6. Mobile collapse

Per ux-principles §"Mobile collapse" and ADR 0006: on viewports <600px, non-active steps collapse to a one-line summary.

**Behavior:**

- Container measures its own width on mount and on resize. If `width < 600`, collapse mode is active.
- In collapse mode, every non-active step renders only its `summary` slot — typically the step title + a short status hint.
- The active step renders its full content as usual.
- Tapping a collapsed completed step expands it (becomes active) per §5.
- Tapping a collapsed future step is a no-op (per §3 invariant).

**Edge cases:**

- If the container is exactly 600px or wider, all steps render their full content.
- Switching from full → collapse mid-wizard is allowed (orientation change). The currently-active step keeps its content; siblings collapse.
- The summary slot is consumer-provided. The primitive does not auto-generate it.

## 7. Accessibility

**Screen reader:**

- The wizard root has `role="region"` and `aria-label="Step wizard"` (overridable via prop).
- Each step is rendered with `role="group"` and `aria-labelledby` pointing at its title.
- Future steps additionally have `aria-disabled="true"` and `tabIndex={-1}`.
- Active step has `aria-current="step"`.
- A polite live region (`aria-live="polite"`, `aria-atomic="true"`) announces step transitions: "Step N of M, {title}, active."

**Focus:**

- On mount, focus lands on the active step's first focusable child.
- On auto-advance and tap-to-revisit, focus moves to the new active step's first focusable child.
- Tab order: within the active step, default DOM order. Outside the active step, only completed steps' summary affordance is in the tab order (so keyboard users can revisit). Future steps are skipped.
- Visible focus rings follow [docs/design-system.md](../design-system.md) §4.3 (web) and platform default (native).

**Reduced motion:**

- If `prefers-reduced-motion` is set, opacity/scale transitions are reduced to instant. Live-region announcements still fire.

**Color independence:**

- Step status is communicated by both the opacity gradient **and** explicit text affordance (e.g., a small "Done" / "Active" / "Up next" label in the step header). Per ux-principles §"Color independence", color/opacity alone is never the sole signal.

## 8. API surface

Initial draft. Final shape to be confirmed in §0 (controlled vs. uncontrolled).

```ts
// lib/ux/spotlight-wizard.tsx

export type WizardStepStatus = 'future' | 'active' | 'completed';

export type WizardStepDescriptor = {
  id: string;
  title: string;
  status: WizardStepStatus;

  // Slots
  content: React.ReactNode; // rendered when active (or always, in non-collapse mode)
  summary: React.ReactNode; // rendered when collapsed
  trailing?: React.ReactNode; // optional right-side affordance in step header

  // Per-step opt-outs
  autoAdvance?: boolean; // default true
  revisitable?: boolean; // default true
};

export type SpotlightWizardProps = {
  steps: WizardStepDescriptor[];
  currentStepId: string;
  onStepChange: (stepId: string) => void;

  saving?: boolean; // disables tap-to-revisit while true
  ariaLabel?: string; // overrides default "Step wizard"
  onAdvance?: (nextStepId: string) => void; // fires after auto-advance

  // Layout overrides; design-system tokens by default
  collapseBreakpoint?: number; // default 600
};

export const SpotlightWizard: React.FC<SpotlightWizardProps>;
```

Companion presentational component (see §0):

```ts
// components/ui/wizard-step.tsx — renders a single step block

export type WizardStepProps = {
  id: string;
  title: string;
  status: WizardStepStatus;
  collapsed: boolean;
  content: React.ReactNode;
  summary: React.ReactNode;
  trailing?: React.ReactNode;
  onActivate: () => void;
  disabled?: boolean;
};

export const WizardStep: React.FC<WizardStepProps>;
```

The wizard owns layout, focus, transitions, mobile-collapse measurement, and live-region announcements. The step component owns the per-step opacity/scale/border treatment.

## 9. File touchpoints

**New:**

- `lib/ux/spotlight-wizard.tsx` — primitive logic + composition
- `components/ui/wizard-step.tsx` — presentational step block (per §0, may consolidate)
- `lib/ux/__tests__/spotlight-wizard.test.tsx` — vitest suites for state transitions, auto-advance, tap-to-revisit, focus, mobile collapse, reduced motion

**Updated:**

- `components/ui/index.ts` — export `WizardStep`
- `docs/design-system.md` — add primitive entry alongside the existing list in §7

**No changes:**

- `docs/ux-principles.md` — already specifies the pattern at the rubric level
- `docs/decisions/0006-spotlight-wizard-ux.md` — already locks the visual + step model

## 10. Roles — what Codex owns vs. what Claude owns

This split exists so Claude and Codex don't thrash on this primitive. Mirrors the pattern from [quick-capture-implementation-split.md](./quick-capture-implementation-split.md).

### Claude owns

- State machine: `WizardStepStatus` invariants, auto-advance rules, tap-to-revisit rules.
- API surface: `SpotlightWizardProps`, `WizardStepProps`, controlled vs. uncontrolled choice (post-§0).
- Accessibility: ARIA roles, focus management, live-region announcements, reduced-motion handling.
- Mobile collapse: viewport/container measurement, collapse-vs-expand logic, summary-slot wiring.
- Tests: vitest suites for state, focus, mobile collapse, reduced motion.
- Animation orchestration: which property animates when, duration values from ux-principles.

### Codex owns

- Final visual treatment: exact accent border color, shadow softness, scale curve.
- Opacity timing feel — within the locked 200ms ease-out, fine adjustment of the curve.
- Step-block density: padding, gap, border-radius selection from design-system tokens.
- Active-step shadow and border integration with the editorial palette.
- Summary-slot typography (when collapsed) — picking the right design-system tokens.
- Visual handling of the "trailing" slot (e.g., "Edit" affordance on completed steps).
- Empty/error visual treatments where the wizard root needs them.

### Shared constraints (do not relitigate)

- Spotlight pattern itself is settled — single screen, vertical stack, opacity gradient. Don't invent a multi-screen variant or a horizontal layout. Per ADR 0006.
- Active 100% / completed 70% / future 30%. Don't tune these values.
- Future steps are non-interactive. Don't add a "preview" affordance.
- Tax/service-charge controls are forbidden inside the splitting wizard's per-person panels (per [m2-splitting.md](./m2-splitting.md) §5.5). The primitive is generic, but its first consumer enforces this.

## 11. Acceptance criteria

- A consumer passes 4 steps, marks step 1 as `active` and the rest as `future`. The primitive renders step 1 at 100% opacity and steps 2–4 at 30% opacity, non-interactive.
- When the consumer flips step 1 to `completed`, auto-advance fires; step 2 becomes active; focus moves into step 2; a polite live-region announces the transition.
- Tapping a `completed` step makes it active; the previously-active step's status is not mutated by the primitive; focus moves into the newly-active step.
- Steps with `revisitable: false` are not tappable when `completed`.
- Steps with `autoAdvance: false` do not trigger auto-advance even when their status flips to `completed`.
- On a viewport narrower than `collapseBreakpoint` (default 600px), non-active steps render only their `summary` slot. Tapping a collapsed completed step expands it (becomes active).
- On orientation change crossing the breakpoint, the active step's content remains rendered; siblings collapse/expand accordingly.
- `prefers-reduced-motion` collapses the 200ms transition to instant; live-region announcements still fire.
- Future steps are not in the tab order; completed steps' summary affordance is.
- ARIA: wizard root has `role="region"`, each step has `role="group"`, active step has `aria-current="step"`, future steps have `aria-disabled="true"`.
- When `saving: true`, tap-to-revisit is disabled; visible state communicates this.
- Visual treatment of active border, shadow, and scale is sourced from design-system tokens — no hard-coded hex values in the primitive.
- The primitive has zero knowledge of splitting, share sets, expenses, or any M2 domain concept. It composes generically.
- Tested at 375×667 (mobile collapse), 600×800 (boundary), and ≥1024 (full layout) in Playwright per [CLAUDE.md](../../CLAUDE.md) self-verify rules.
