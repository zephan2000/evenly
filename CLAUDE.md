# Evenly — Agent Context

You are working on **Evenly**, an AI-powered expense tracking app for group bill splitting on trips.

## Owner

Zephan (`pergroup.sg@gmail.com`). Singapore-based. Solo builder.

## What this app does

Users scan receipts (or use voice/manual entry), AI extracts a structured expense, then a guided wizard helps split items per person. Splitting is expense-level attribution; settlement is the later trip-level recomputation/output of those splits. Trips are owner-managed; members can join via share link without an account.

## Stack (locked)

- **Frontend:** Expo SDK 54 + Expo Router 6, TypeScript strict, React 19. Mobile-first, exports to web for Vercel.
- **Backend:** Supabase (Postgres, Storage for receipt images, RLS).
- **Auth:** Clerk (owner only; members can be anonymous). Wired to Supabase RLS via Clerk JWT.
- **Vision/AI:** Gemini 2.0 Flash (free tier, primary). Qwen2.5-VL via Hyperbolic/OpenRouter (fallback).
- **FX rates:** ExchangeRate-API (`open.er-api.com`, free, no key; covers VND/SE-Asia). Frankfurter dropped — no VND coverage. See ADR 0007.
- **Hosting:** Vercel (web) + Expo Application Services (mobile builds).

## MVP scope

**In scope:**

- Receipt scan → AI extraction → structured expense
- Spotlight wizard for splitting (see `docs/ux-principles.md`)
- Share-set memory (reusable participant configs)
- Multi-currency with FX snapshot
- GST handling (inclusive/exclusive classification)
- Settlement view (simplify debts)
- Trip share via link (anonymous members allowed)
- Casual-mode collaborative split editing with audit attribution

**Out of scope for MVP:**

- Voice capture (post-MVP, secondary path)
- Tax/deductibility export (stretch)
- PayNow / payment integration (post-MVP)
- Per-trip strict-mode auth (post-MVP; default to casual mode)
- PIN-on-claim impersonation defense (v1.1)

## Development commands

```bash
npm run start      # expo dev server
npm run web        # web target
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run lint       # expo lint
npm run typecheck  # tsc --noEmit (added in package.json)
```

## Folder map

- `app/` — Expo Router routes (file-based routing)
- `components/` — shared UI primitives
- `lib/ai/` — Gemini calls, prompt construction, fallback chain
- `lib/auth/` — Clerk integration, anonymous member management
- `lib/db/` — Supabase client + typed queries
- `lib/fx/` — currency conversion, rate caching
- `lib/gst/` — GST mode classification, distribution math
- `lib/settlement/` — debt simplification algorithm
- `lib/ux/` — spotlight wizard primitives
- `supabase/migrations/` — SQL migrations (one file per change, timestamp-prefixed)
- `docs/` — authoritative documentation (read these before guessing)
- `docs/decisions/` — ADRs explaining _why_

## How to work in this repo

**Before writing code:**

1. Check `docs/decisions/` for relevant ADRs.
2. Check `docs/data-model.md` if touching DB.
3. Check `docs/ai-prompts.md` if touching AI.
4. Check `docs/ux-principles.md` for any UI work.

**While writing code:**

- TypeScript strict — no `any`, no `@ts-ignore` without justification comment.
- No new dependencies without a one-line note in the relevant ADR or a new ADR.
- Match existing patterns in `lib/` — look before writing.
- Server-only code (API routes, AI calls) goes in `app/api/` or server-only files; never call AI from the client.
- Receipt images go to Supabase Storage, never base64-embedded in DB rows.

**After writing UI code (mandatory):**

- Run `/ux-audit` on the change. This audits against `docs/ux-principles.md`. Address findings before claiming done.

**After writing AI prompt code:**

- Update `docs/ai-prompts.md` with the prompt diff.
- Add a snapshot test of the parser if structure changed.

**Before claiming done:**

- `npm run typecheck` passes.
- `npm run lint` passes.
- For UI: `/ux-audit` passes or findings are explicitly accepted.

## Multi-agent collaboration (Claude Code + Codex)

Two agents, distinct roles, with **Playwright** as shared visual ground truth. Full detail in `docs/agent-collaboration.md` and ADR 0009.

### Roles

- **You (Claude Code) = Architect + Builder.** Uses `frontend-design` skill for UI scaffolding (structure, behavior, accessibility). Uses `playwright` skill for self-verification (state coverage, screenshots).
- **Codex = Senior Reviewer.** Uses `playwright` skill to take screenshots and compare against design references; flags visual mismatches and partial implementations Claude missed. Bounded to UI visuals.

### Required skills

Both agents lean on:

- **`frontend-design`** — opinionated UI generation. Use it explicitly for new screens/components; don't freelance UI from scratch.
- **`playwright`** — browser automation. Shared visual ground truth for self-verification (you) and review (Codex).

If either skill is unavailable, surface it to the user before doing UI work.

### Per-feature workflow

1. **Scaffold (you, with `frontend-design`).** Layout, hierarchy, type, color tokens, accessibility shape, state machine (empty/loading/error/offline/success). Match `lib/ux/` patterns. Visuals can be placeholder; structure must be solid.
2. **Self-verify (you, with `playwright`).** Run dev server, navigate the screen, capture screenshots at 375×667 and ≥1024 for default + empty + loading + error states. Run `/ux-audit`.
3. **Senior Review (`/codex`).** User invokes Codex via `/codex`. Codex uses Playwright to compare against design references, produces a findings report.
4. **Reconcile.** Address each finding or push back with reasoning. Conflicts with `docs/ux-principles.md` or ADRs → flag to user, never silently merge.

### When to suggest a Codex handoff

Default ending after every UI scaffold + self-verification: **"Ready for /codex Senior Review — want me to draft the brief?"**

Also volunteer Codex when:

- Inventing a UX pattern not covered by `docs/ux-principles.md`
- Cross-platform UI trade-off with low confidence
- Visual fidelity matters (post-MVP polish, brand-sensitive screens)

### Brief format when handing off to Codex

```
Goal: <one sentence>
Reference: <paths or URLs>
Files / components: <list>
Viewports: 375×667 mobile, 1024+ web
Constraints: follow docs/ux-principles.md
Out of scope: logic, data, AI, server
Required output: findings report with screenshots
```

### Out of scope for Codex

Architecture, data model, RLS, auth, AI prompts, server logic, settlement math. If Codex weighs in on these, treat as low-signal unless the user explicitly asks otherwise.

### Anti-patterns

- Shipping UI without `playwright` self-verification.
- Skipping `frontend-design` and freelancing UI from scratch.
- Skipping `/ux-audit` because "Codex will catch it" — both run; overlap but not equivalent.
- Silently merging Codex suggestions that conflict with our docs.

## Decisions you should NOT relitigate

These are settled. If you think one is wrong, raise it explicitly with the user; don't quietly change it:

1. Gemini 2.0 Flash over Qwen2.5-VL (cost + quality, see `0002`)
2. Hybrid auth (owner only) over universal accounts (see `0003`)
3. Same-display-name reconciliation accepts impersonation risk (see `0008`)
4. Share sets are trip-scoped, not nested groups (see `0004`)
5. AI classifies GST mode before extracting values (see `0005`)
6. FX snapshots at expense time, not settlement time (see `0007`)
7. Splitting defaults to `all members`; AI suggestions are opt-in and resettable
8. Spotlight wizard collapse is based on available rendered width, not a fixed device class

## Privacy / safety constraints

- Never store raw IPs at rest. Geolocate to city, then drop.
- Never log receipt image contents.
- Never log PII (names, amounts) at INFO level. DEBUG only, scrubbed in prod.
- Receipt images are private to trip members (Supabase RLS enforces).

## Environment variables

See `.env.example`. Never commit real keys. The repo is **public**.
