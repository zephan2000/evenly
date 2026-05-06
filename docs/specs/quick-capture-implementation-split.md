# Quick Capture — Implementation Split

Purpose: reduce thrash between Claude and Codex by defining ownership boundaries.

## Claude Owns

Claude should implement:

- DB migration
- reducer/state model
- local persistence
- orchestrator
- batch tray shell
- quick-capture-specific components
- batch-mode edit wrapper
- tests for reducer/orchestrator behavior

Concrete files:

- `supabase/migrations/{timestamp}_quick_capture_batches.sql`
- `lib/quick-capture/state.ts`
- `lib/quick-capture/orchestrator.ts`
- `lib/quick-capture/persist.ts`
- `lib/quick-capture/__tests__/...`
- `components/ui/dot-row.tsx`
- `components/quick-capture/draft-card.tsx`
- `components/quick-capture/trip-picker-sheet.tsx`
- `app/(tabs)/quick-capture/index.tsx`
- `app/(tabs)/quick-capture/[draftId].tsx`

Claude should optimize for:

- logic correctness
- state consistency
- implementation completeness
- alignment with the locked UX model

Claude should not independently decide:

- layout emphasis changes
- new interaction patterns beyond the spec
- warning/banner tone and presentation tradeoffs
- density/spacing tradeoffs that affect readability
- copywriting choices that materially change UX tone

When those decisions arise, Claude should hand them back to Codex.

## Codex Owns

Codex should handle:

- visual hierarchy refinement
- spacing, composition, and art direction
- warning-state nuance
- consistency with the broader editorial design system
- final polish on tray cards, sheet spacing, row density, and emphasis

Codex should optimize for:

- readability
- calmness
- mobile-first compositional quality
- avoiding UI drift from Home / Settings / Sign-in

## Shared Constraints

Neither Claude nor Codex should casually change:

- the inbox model
- stable capture order
- one tray-level save action
- local-draft-first resilience
- per-receipt `Needs review`

If those need to change, treat it as a product-spec revision, not an implementation tweak.

Additional rule:

- Claude owns implementation decisions
- Codex owns UX and visual design decisions
- If a decision touches both, Claude should implement the conservative path and request Codex direction for the UX layer
