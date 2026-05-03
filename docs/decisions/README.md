# Architecture Decision Records

Lightweight ADRs documenting non-obvious choices. Read these before guessing why something is the way it is.

## Format

Each ADR is a short markdown file:

- **Title:** number + slug
- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Context:** what problem prompted this decision
- **Decision:** what we chose
- **Consequences:** trade-offs we accept

## Index

| #                                           | Title                                               | Status   |
| ------------------------------------------- | --------------------------------------------------- | -------- |
| [0001](./0001-tech-stack.md)                | Tech stack                                          | Accepted |
| [0002](./0002-vision-model-gemini-flash.md) | Vision model: Gemini 2.0 Flash                      | Accepted |
| [0003](./0003-hybrid-auth-model.md)         | Hybrid auth: owner authenticated, members optional  | Accepted |
| [0004](./0004-share-sets.md)                | Share sets, not nested groups                       | Accepted |
| [0005](./0005-gst-mode-classification.md)   | AI classifies GST mode before extracting values     | Accepted |
| [0006](./0006-spotlight-wizard-ux.md)       | Spotlight wizard for bill splitting                 | Accepted |
| [0007](./0007-fx-snapshots.md)              | FX rate snapshots at expense time                   | Accepted |
| [0008](./0008-impersonation-tradeoff.md)    | Same-name reconciliation accepts impersonation risk | Accepted |

## When to add an ADR

- A non-obvious architectural choice.
- A decision the team will likely re-litigate without context.
- A choice that contradicts what an outside engineer would assume.
- A trade-off we explicitly accepted (so future-us doesn't "fix" it as a bug).

## When NOT to add an ADR

- Routine implementation details.
- Things that are obvious from the code or industry standard.
- Temporary workarounds (use a `// TODO` comment instead).
