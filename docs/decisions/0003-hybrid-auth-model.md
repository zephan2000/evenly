# 0003 — Hybrid auth: owner authenticated, members optional

**Status:** Accepted (2026-05-03)

## Context

Splitwise requires every member to have an account — high friction, abandons casual users. Tricount uses link-only access — zero friction, but no real attribution.

## Decision

**Three member states:**

1. **Anonymous** — joined via share link, picked a display name. Pseudonymously attributed via `anon_id` (client UUID), display name, user agent, locale, timezone, geo city, fingerprint hash.
2. **Authenticated** — signed in with Clerk before/during join. Full attribution, cross-device.
3. **Claimed** — was anonymous, later signed in. Past activity opt-in merged with their Clerk identity.

Trip owners are always authenticated (Clerk).

If a user has a Clerk session when opening a share link, auto-link as authenticated; skip the anonymous flow entirely.

## Cross-device anonymous reconciliation

When the same anonymous user opens the trip on a new device:

- They see the existing member list and either pick their name or type it.
- Same display name within a trip = same person (auto-merge, including future audit log entries).

**Known limitation:** anyone with the share link can impersonate any anonymous member by typing their name. We accept this as the Tricount model. Future v1.1: optional PIN on first claim.

## Per-trip auth modes

- **Casual** (default) — anyone with link can edit; audit log records pseudonymous attribution.
- **Strict** — owner approval required for edits/deletes by non-owners.

Owner can flip mode at any time.

## Consequences

- Audit log is critical for resolving disputes. Build it in from day one.
- Don't store raw IPs (privacy / PDPA). Geolocate to city, drop IP.
- Owner lockout = orphaned trip. Mitigations: co-owner promotion, always-on CSV export.
- Share link is rotatable by owner.
- Casual mode is the default; strict mode is opt-in.
