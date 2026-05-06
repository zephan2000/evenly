# Quick Capture — Claude Implementation Brief

Read these first:

- [quick-capture.md](./quick-capture.md)
- [design-system.md](../design-system.md)
- [ux-principles.md](../ux-principles.md)
- [claude-ui-implementation-spec.md](../claude-ui-implementation-spec.md)

## Mission

Implement the quick-capture feature using the locked inbox model.

Do not reinterpret the product flow. The spec is already intentionally narrowed.
Do not make fresh UX design decisions when the spec or design system leaves room for taste. Escalate those decisions back to Codex for direction.

## Locked Product Rules

- Quick capture is an inbox, not a wizard
- Preserve original capture order
- `Needs review` is per receipt
- One tray-level persistence action only: `Save receipts`
- Inline receipt editing updates local draft only
- Full-screen edit is fallback, not default
- Bulk save is the common path
- Flagged review is the exception path
- Local draft persistence is required to protect against interruption/backgrounding

## UI Rules

- Use `AppScreen` for top-level shell
- Use `Card` for grouped surfaces
- Use `SectionHeader` where a section title/trailing action pattern appears
- Use `Banner` for offline/error/info states
- Use canonical hero/brand rules only where needed; quick capture is mostly a working surface
- Keep operational text in `Geist`
- Do not introduce decorative fonts into tray rows, totals, or form fields

## Components Claude Should Build

Expected feature-specific components:

- `components/ui/dot-row.tsx`
- `components/quick-capture/draft-card.tsx`
- `components/quick-capture/trip-picker-sheet.tsx`

Expected logic files:

- `lib/quick-capture/state.ts`
- `lib/quick-capture/orchestrator.ts`
- `lib/quick-capture/persist.ts`

Expected screens:

- `app/(tabs)/quick-capture/index.tsx`
- `app/(tabs)/quick-capture/[draftId].tsx`

## Implementation Advice

- Start from state/reducer/orchestrator correctness first
- Keep the visible state vocabulary simple: `Processing`, `Ready`, `Needs review`, `Saved`, `Failed`
- Separate transport/orchestration state from user-facing review state
- Do not sort cards by confidence or error
- Avoid introducing per-card save-to-server actions
- When unsure, favor tray coherence over cleverness

## Persistence Requirements

Persist local draft:

- after extraction result
- after inline edit change, debounced
- after trip change
- after status transition
- on app background

Do not assume users will finish in one sitting.

## Handoff Boundary

Claude should implement:

- reducer/state model
- persistence
- orchestration
- tray shell
- draft card shell
- trip-picker shell
- batch-mode edit wrapper

Codex will refine:

- final visual hierarchy
- spacing polish
- nuanced warning treatment
- editorial alignment with the broader design system

If Claude encounters uncertainty in any of these areas, it should pause and surface the question rather than invent a new pattern:

- visual hierarchy or emphasis
- spacing and density tradeoffs
- warning/error tone or placement
- component composition when multiple UI patterns seem plausible
- copy tone for user-facing UX moments

## Prompt To Use With Claude

```text
Read and follow these documents as the source of truth:

1. docs/specs/quick-capture.md
2. docs/design-system.md
3. docs/ux-principles.md
4. docs/claude-ui-implementation-spec.md
5. docs/specs/quick-capture-claude-brief.md

Implement quick capture according to the locked inbox model.

Non-negotiable rules:
- preserve original capture order
- per-receipt needs-review handling
- one tray-level persistence action: "Save receipts"
- inline card editing updates local draft only
- full-screen edit is fallback
- periodic local draft persistence is required

Before coding:
- state which reusable components you will use
- state which quick-capture-specific components/files you will add
- call out any spec ambiguity before making assumptions
- explicitly hand any UX/design judgment calls back to Codex instead of resolving them yourself

Then implement the quick-capture logic and UI shell in code.
```
