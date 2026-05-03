# 0004 — Share sets, not nested groups

**Status:** Accepted (2026-05-03)

## Context

A real expense often has multiple equal-split groups: "starters split among all 4", "wine split between 2", "mains individual." Nesting groups within a trip adds modeling complexity. Reusing splits across expenses is a common pattern.

## Decision

- Trip is the only top-level container. No sub-trips, no nested groups within a trip.
- "Share sets" are reusable participant configurations within a trip (e.g., "all 4", "Z+A").
- Share sets are **auto-saved** as users split expenses. The system detects when a user picks the same combination of members twice and offers to save/reuse.
- Future expenses suggest share sets sorted by `last_used_at` for one-tap reuse.
- An expense item can be split via:
  - A share set (equal among that set), OR
  - Explicit per-member amounts, OR
  - Percentages (post-MVP).

## Why not nested groups

- Cognitive overhead: users must mentally model "which group does this expense belong to?"
- Most use cases (trips with friends) have ad-hoc splits per item, not a stable hierarchy.
- Share sets give the same expressiveness for ~90% of cases with simpler UX.

## Consequences

- Data model has `share_sets` and `share_set_members` tables, not a recursive `groups` table.
- Migration cost is low if we ever add nested groups; share sets become a special case.
- The bill-splitting wizard step 1 is "identify share groups" rather than "pick a group."
