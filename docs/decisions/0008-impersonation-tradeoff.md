# 0008 — Same-display-name reconciliation accepts impersonation risk

**Status:** Accepted (2026-05-03)

## Context

Cross-device support for anonymous members: when a member opens the trip on a second device, we need to reconcile their identity.

## Options considered

1. **Force sign-in for cross-device** — clean attribution, but breaks the "no account required" promise.
2. **Cryptographic claim** — original device generates a signed token; new device must scan a QR or paste the token. High friction.
3. **Display-name match (chosen)** — new device picks/types their existing name; same name = same person.

## Decision

**Display-name match.** When an anonymous member opens the trip on a new device:

- They see the existing trip member list.
- They pick their name (one tap) or type it.
- Same `display_name` (case-insensitive) within a trip = same person. The new device gets associated with that `trip_member` row.

## Known limitation: impersonation

Anyone with the share link can claim to be any anonymous member by typing their display name. We accept this as the **Tricount model**:

- Trip share links are sensitive; users are responsible for not sharing them with hostile parties.
- For high-stakes trips, owners can enable strict mode (requires owner approval for edits/deletes — see ADR 0003).
- The audit log records device fingerprints, so even after impersonation, suspicious patterns can be detected.

## Future v1.1 mitigation

Optional **PIN on first claim**: a member sets a 4-digit PIN when they first join. Reconciling on a new device requires name + PIN. Negligible friction increase, blocks casual impersonation.

We are NOT implementing this in MVP. Don't treat the current model as a security bug; it's a deliberate UX choice consistent with Tricount.

## Consequences

- `trip_members` has a unique constraint on `(trip_id, lower(display_name))`.
- The "name picker" UI on cross-device join shows the existing trip members for one-tap reuse.
- The audit log captures device fingerprint + geo city + UA on every mutation. Critical for post-hoc dispute resolution.
