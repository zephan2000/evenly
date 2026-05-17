# 0001 — Tech stack

**Status:** Accepted (2026-05-03)

## Context

Evenly is a mobile-first expense-tracking app with web parity. Solo builder, prefers free tiers, must deploy to Vercel for web.

## Decision

- **Frontend:** Expo SDK 54 + Expo Router 6 (file-based routing, mobile + web from one codebase). TypeScript strict.
- **Backend:** Supabase (Postgres, Storage, RLS).
- **Auth:** Clerk (free tier 10k MAU, better DX than Supabase Auth alone). Wired to Supabase via Clerk-issued JWT.
- **AI:** Hosted APIs (Gemini Flash, with fallbacks). Vercel cannot self-host vision models in serverless.
- **FX rates:** ExchangeRate-API `open.er-api.com` (free, no key). Superseded frankfurter.app (ECB-backed but no VND); see ADR 0007 "Provider note (2026-05-18)".
- **Web hosting:** Vercel. Expo Router exports a static web build that Vercel handles natively.
- **Mobile builds:** EAS Build when needed.

## Why not other choices

- **React Native CLI** instead of Expo: more control, but loses the web target and adds tooling overhead. Not worth for solo builder.
- **Next.js + Capacitor:** web-first with mobile bolt-on, but mobile experience is degraded. Evenly is mobile-first.
- **Supabase Auth alone:** simpler integration, but Clerk's UX (email magic links, social, phone, etc.) is significantly better with less work.
- **Self-hosted Postgres:** unnecessary ops burden for a solo builder.

## Consequences

- Two auth systems (Clerk + Supabase RLS) require careful JWT setup. See `docs/setup.md`.
- Some Expo features (e.g., haptics, native modules) won't work on web — guard with `Platform.OS`.
- `EXPO_PUBLIC_*` env vars are inlined at build time, not runtime. Server keys must NOT use the `EXPO_PUBLIC_` prefix.

## Addenda

### 2026-05-06 — `@gorhom/bottom-sheet` adopted for half-sheets

Half-sheet modals (M1: trip-create; post-MVP: currency picker, category picker, share-sheet, member picker) ship via `@gorhom/bottom-sheet@^5`. Peer deps `react-native-reanimated` and `react-native-gesture-handler` were already in the lockfile.

**Why not roll our own:** gesture arbitration (sheet drag vs. content scroll), keyboard avoidance, a11y modal semantics, and snap-point velocity physics are non-trivial cross-platform problems. We'd own the bug tail forever for a single sheet's worth of saved work; at 4+ sheets it never breaks even.

**Wrapper invariants** (`components/ui/bottom-sheet.tsx`):

- Content goes inside `BottomSheetView` (Gorhom requires this for `enableDynamicSizing` and for stable layout measurement on web).
- For text inputs nested inside a sheet, use `BottomSheetTextInput` directly from `@gorhom/bottom-sheet` — do not nest our own `<TextInput>`, it causes keyboard glitches.
- Root must wrap children in `<GestureHandlerRootView><BottomSheetModalProvider>` (done in `app/_layout.tsx`).

A benign React 19 dev warning ("Accessing element.ref was removed…") emits from Gorhom internals; tracked upstream, not actionable here.

`playwright` was added as a devDep at the same time so `scripts/screenshot-2d.mjs` and future per-chunk self-verify scripts are reproducible without depending on the user-scoped MCP plugin.
