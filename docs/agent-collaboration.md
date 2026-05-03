# Agent collaboration

This project pairs two coding agents with **Playwright** as a shared "eyes" interface so visual checks have ground truth, not just claims.

## Roles

### Claude Code — Architect + Builder

- Owns architecture, data model, RLS, auth, AI prompts, server logic, settlement math.
- For UI: uses the `frontend-design` skill for scaffolding (layout, hierarchy, accessibility, state machines, behavior).
- Uses the `playwright` skill to **self-verify** — runs the dev server, exercises new screens, captures screenshots, validates required states (empty / loading / error / offline).
- Reasons across the codebase and maintains project-wide context via `CLAUDE.md` + `docs/`.

### Codex — Senior Reviewer

- Critiques Claude's UI output. Catches partial implementations, visual mismatches, and details Claude missed.
- Uses the `playwright` skill to take screenshots of Claude's UI in situ and compare them iteratively against design references / briefs.
- Strong at pixel-level fidelity: spacing, typography, color, motion, responsive behavior at multiple viewports.
- Invoked by the user via `/codex` (the Codex plugin running inside Claude Code).
- **Out of scope for Codex:** architecture, data model, RLS, auth, AI prompts, server logic, settlement math. Treat Codex output on these as low-signal unless explicitly requested.

## Required skills

Both agents lean on:

- **`frontend-design`** — Claude's design-aware UI generation. Use it explicitly when scaffolding any new screen or component; don't freelance UI from scratch.
- **`playwright`** — browser automation. Lets either agent navigate the live app, take screenshots, simulate interactions, and verify states. This is the shared visual ground truth.

If either skill is unavailable in a session, surface it to the user before proceeding with UI work.

## Workflow per UI feature

### 1. Claude scaffolds (frontend-design)

Goal: structure + behavior, not pixel polish.

- Use `frontend-design` skill for layout, hierarchy, type scale, color tokens, accessibility shape.
- Define the state machine: empty, loading, error, offline, success.
- Match patterns in `lib/ux/` (especially the spotlight wizard).
- Wire data plumbing as needed; UI uses real types from `lib/db/`.

Output: a working scaffold the user can navigate to.

### 2. Claude self-verifies (playwright)

Before claiming done:

- Start dev server (`npm run web`).
- Use `playwright` to navigate the new screen.
- Capture screenshots of:
  - Default state with realistic data
  - Empty state
  - Loading state (intercept network if needed)
  - Error state (force a failure)
  - At 375×667 (mobile baseline) and ≥1024 (web)
- Run `/ux-audit` against `docs/ux-principles.md`.
- Address findings or note explicit acceptances in the commit.

Output: PR/commit ready, with screenshots attached and `/ux-audit` clean.

### 3. Codex Senior Review (`/codex`)

User invokes `/codex` and provides:

- The brief / reference designs (paths, URLs, or screenshots).
- The components / screens to review.
- Constraints (mobile-first 375×667, accessibility floor, etc.).
- "Out of scope: logic, data, AI, server."

Codex uses Playwright to:

- Navigate the live app.
- Take screenshots at the same viewports Claude used.
- Compare against the reference iteratively.
- Produce a findings report: visual mismatches, partial implementations, motion gaps, accessibility issues, edge cases.

### 4. Claude reconciles

- Read Codex output as **advisory**, not authoritative.
- For each finding:
  - **Visual issue Claude missed** → fix it.
  - **Conflict with `docs/ux-principles.md` or an ADR** → flag to the user. Two valid resolutions: adopt Codex's approach + update the principle (with reasoning) or reject (with reasoning).
  - **Net new pattern not in our docs** → evaluate on merit; if adopted, document in `docs/ux-principles.md`.
- Never silently merge Codex suggestions that conflict with our docs.
- Note convergence in commit message: "Codex review: clean" or "Codex findings addressed: <summary>".

## When Claude should suggest a Codex handoff

Default after every UI scaffold: **"Ready for /codex Senior Review — want me to draft the brief?"**

Also volunteer Codex when:

- About to invent a UX pattern not covered by `docs/ux-principles.md`.
- Cross-platform UI trade-off with low Claude confidence.
- Visual fidelity matters (post-MVP polish, brand-sensitive screens).

## Brief format for handing off to Codex

```
Goal: <one sentence>
Reference: <paths to screenshots or reference URLs>
Files / components: <list>
Viewports to check: 375×667 mobile, 1024+ web
Constraints: <e.g., follow docs/ux-principles.md spotlight pattern>
Out of scope: logic, data, AI integration, server code
Required output: findings report with screenshots + diffs
```

## Anti-patterns

- ❌ Claude shipping UI without running Playwright self-verification.
- ❌ Codex modifying logic, data, AI, or server code (flag if it does).
- ❌ Silently merging Codex suggestions that conflict with our docs.
- ❌ Skipping `frontend-design` skill and freelancing UI from scratch.
- ❌ Skipping `/ux-audit` because Codex will catch issues — both should run; they overlap but aren't equivalent.
