# 0009 — Claude Code + Codex collaboration with Playwright as shared eyes

**Status:** Accepted (2026-05-04)

## Context

Solo builder with two coding agents (Claude Code, Codex) and two relevant skills (`frontend-design`, `playwright`). Without a defined collaboration pattern, the two agents either duplicate work or step on each other.

Empirically, Claude is stronger at reasoning across a codebase and maintaining project context; Codex is stronger at visual fidelity and catching partial implementations during iterative review against a design reference. Playwright gives both agents a way to "see" the live app — turning visual review from claim-based into evidence-based.

## Decision

**Roles:**

- **Claude Code = Architect + Builder.** Uses `frontend-design` for UI scaffolding and `playwright` for self-verification.
- **Codex = Senior Reviewer.** Uses `playwright` to compare Claude's UI against design references and flag gaps. Domain bounded to UI visuals; out of scope on architecture / data / AI / server.

**Per-feature workflow:**

1. Claude scaffolds UI using `frontend-design` (structure, behavior, accessibility).
2. Claude self-verifies with `playwright` (states + screenshots) and runs `/ux-audit`.
3. User invokes `/codex` for Senior Review; Codex uses Playwright to critique against reference.
4. Claude reconciles findings — addresses or pushes back with reasoning. Conflicts with `docs/ux-principles.md` or ADRs are flagged, never silently merged.

Detailed in `docs/agent-collaboration.md`.

## Why each component matters

- `frontend-design` makes Claude's UI scaffolding opinionated and principled rather than ad-hoc.
- `playwright` provides shared ground truth — both agents can see the same live app, so reviews are concrete.
- Codex's critique role is well-suited to its strength (visual detail) without overlapping Claude's architecture role.
- The reconciliation step prevents silent regressions when Codex disagrees with our docs.

## Why not other arrangements

- **All-Claude:** loses Codex's visual fidelity advantage; iterative pixel-pushing is slower and lower quality with Claude alone.
- **All-Codex:** loses cross-codebase reasoning and project-context maintenance (CLAUDE.md hierarchy + memory).
- **Sequential without Playwright:** Codex can only critique code, not the rendered UI — misses partial implementations that compile but render wrong.
- **Both agents both roles:** ambiguous ownership, duplicated work, conflicting changes.

## Consequences

- `docs/agent-collaboration.md` is authoritative for the workflow; update it if the pattern evolves.
- Both agents must have access to `frontend-design` and `playwright` skills. If a session lacks them, Claude flags it before doing UI work.
- UI commits include Playwright screenshots and `/ux-audit` results.
- Reconciliation overhead is real but acceptable; it's surfaced in commit messages so the audit trail is preserved.
- This ADR may be revisited if either agent's capabilities shift significantly.
