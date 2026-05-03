# Evenly — Agent Context

You are working on **Evenly**, an AI-powered expense tracking app for group bill splitting on trips.

## Owner

Zephan (`pergroup.sg@gmail.com`). Singapore-based. Solo builder.

## What this app does

Users scan receipts (or use voice/manual entry), AI extracts a structured expense, then a guided wizard helps split items per person. Trips are owner-managed; members can join via share link without an account.

## Stack (locked)

- **Frontend:** Expo SDK 54 + Expo Router 6, TypeScript strict, React 19. Mobile-first, exports to web for Vercel.
- **Backend:** Supabase (Postgres, Storage for receipt images, RLS).
- **Auth:** Clerk (owner only; members can be anonymous). Wired to Supabase RLS via Clerk JWT.
- **Vision/AI:** Gemini 2.0 Flash (free tier, primary). Qwen2.5-VL via Hyperbolic/OpenRouter (fallback).
- **FX rates:** frankfurter.app (free, ECB-backed).
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

## Decisions you should NOT relitigate

These are settled. If you think one is wrong, raise it explicitly with the user; don't quietly change it:

1. Gemini 2.0 Flash over Qwen2.5-VL (cost + quality, see `0002`)
2. Hybrid auth (owner only) over universal accounts (see `0003`)
3. Same-display-name reconciliation accepts impersonation risk (see `0008`)
4. Share sets are trip-scoped, not nested groups (see `0004`)
5. AI classifies GST mode before extracting values (see `0005`)
6. FX snapshots at expense time, not settlement time (see `0007`)

## Privacy / safety constraints

- Never store raw IPs at rest. Geolocate to city, then drop.
- Never log receipt image contents.
- Never log PII (names, amounts) at INFO level. DEBUG only, scrubbed in prod.
- Receipt images are private to trip members (Supabase RLS enforces).

## Environment variables

See `.env.example`. Never commit real keys. The repo is **public**.
