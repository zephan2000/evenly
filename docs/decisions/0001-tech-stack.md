# 0001 — Tech stack

**Status:** Accepted (2026-05-03)

## Context

Evenly is a mobile-first expense-tracking app with web parity. Solo builder, prefers free tiers, must deploy to Vercel for web.

## Decision

- **Frontend:** Expo SDK 54 + Expo Router 6 (file-based routing, mobile + web from one codebase). TypeScript strict.
- **Backend:** Supabase (Postgres, Storage, RLS).
- **Auth:** Clerk (free tier 10k MAU, better DX than Supabase Auth alone). Wired to Supabase via Clerk-issued JWT.
- **AI:** Hosted APIs (Gemini Flash, with fallbacks). Vercel cannot self-host vision models in serverless.
- **FX rates:** frankfurter.app (free, no key, ECB-backed).
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
