# Evenly

AI-powered expense tracking for group trips. Scan a receipt, split it cleanly.

## What's different

- **Receipt-first:** scan a receipt, AI extracts items + GST + service charge automatically.
- **Spotlight wizard:** instead of tedious per-person screens, a single guided flow with smart defaults.
- **No accounts required for members:** trip owner signs in; everyone else joins via share link.
- **GST-aware:** correctly distributes Singapore GST and service charge proportionally.
- **Multi-currency:** captures FX rate at expense time so settlements match what you actually paid.

## Status

Early development. MVP in progress.

## Tech

Expo + Expo Router (mobile + web), Supabase, Clerk, Gemini 2.0 Flash, Vercel.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in keys
npm run start
```

See [`docs/setup.md`](./docs/setup.md) for full environment setup.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — context for AI agents working in this repo
- [`docs/data-model.md`](./docs/data-model.md) — Postgres schema
- [`docs/ai-prompts.md`](./docs/ai-prompts.md) — AI prompts & expected JSON shapes
- [`docs/ux-principles.md`](./docs/ux-principles.md) — UX rules
- [`docs/decisions/`](./docs/decisions/) — architecture decision records

## License

TBD.
