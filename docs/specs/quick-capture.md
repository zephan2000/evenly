# Quick capture — Spec (M1.5)

**Status:** Draft, 2026-05-06. Pending Zephan review → Codex review → implementation.

**Authors:** Claude (spec, mockup, underlying logic), Codex (UI implementation), Zephan (product owner).

## 0. Confirmations resolved (2026-05-06)

- **Per-receipt trip override UI ships in M1.5** (not deferred). Toggle lives in trip-picker sheet; per-card trip chips light up when toggled on; C5 batch-mode status row mirrors the per-card chip; tray header chip adapts to mixed state. Underlying state and DB shape (per-draft `tripId`) already supported this — UI is now wired in.
- **Sub-agents authorized**: Claude may spawn isolated background sub-agents for parallel workstreams (regression nets, M2 spec, etc.).
- **Scaffold/skin split**: Claude builds behaviorally-correct mockup + structure; Codex does final visual skinning.

## 1. Goal

Enable a user to upload up to 8 receipts at once, see them parsed in parallel, assign them to a trip, and confirm/save them with minimum repetition. Single-receipt flow unchanged.

## 2. User story

> "I just got back from the trip and have 6 photos of receipts on my camera roll. I want to add them all to Evenly without doing the same dance 6 times."

## 3. Scope

**In scope (M1.5):**

- Multi-image picker (1–8 images).
- Parallel upload to Supabase Storage.
- Parallel AI extraction.
- Tray view (workspace) for batch state.
- Trip-assignment chip on tray (batch-mode default: one trip per batch).
- **Per-receipt trip override**: toggle in trip-picker sheet; per-card trip chips on draft cards; C5 status row shows the card's trip chip in per-receipt mode.
- Batch-mode C5 full-edit fallback with dot-row progress + tap-to-jump.
- Flagged review flow (Review flagged receipts → auto-advance through flagged receipts only).
- Bulk save (ready receipts) with inline confirmation.
- Device-local draft persistence (survives backgrounding + cold launch).
- Batch undo within 24h after save (detail screen affordance).

**Out of scope (deferred):**

- Cross-device draft sync → post-MVP.
- Duplicate detection → post-MVP.
- Receipt-merge (one image, two receipts) → post-MVP.
- Splitting → still M2.

## 4. Milestone slot

**M1.5**, between M1 (single-receipt scan + save) and M2 (splitting). Reuses M1's pipeline; doesn't depend on M2.

## 5. UX flow

### 5.1 Entry

- Same "Scan a receipt" CTA on home (C2) — no new entry point.
- OS picker config: `allowsMultipleSelection: true`, `selectionLimit: 8`.
- Decision tree on picker close:
  - 0 images → cancel, no-op.
  - 1 image → existing C4 single-receipt flow (no regression).
  - 2–8 images → new C4b tray flow.

### 5.2 C4b — Batch tray (new screen)

**Header:**

- Title: "Quick capture".
- **Trip chip** below title: "Save to {Current Trip Name}" with chevron. Tap → trip picker BottomSheet (§5.7).
- Right-side: discard-all button (trash icon, confirm sheet).

**Body:** vertical list of N draft cards in **original capture order**. The tray behaves like an inbox, not a wizard:

- **Leading:** 56pt receipt thumbnail (existing `ReceiptThumbnail`).
- **Center:** merchant, total, date/currency summary, and a compact status line.
- **Trailing:** spinner (if processing), warning glyph (if needs review / failed), or ✓ if saved.
- **Tap:** expands the card inline for quick correction. Full-screen C5 is fallback for more complex edits.

**Per-card visible status model:**

- `Processing`
- `Ready`
- `Needs review`
- `Saved`
- `Failed`

**`Needs review` is per-receipt, never a tray-level pseudo-state.** A receipt enters `Needs review` when its own extraction is low-confidence, incomplete, or suspicious. The review affordance is organized under that specific receipt card, not promoted into a global queue that changes list order.

**Expanded card behavior:**

- Tapping a receipt expands it in place.
- Expanded quick-edit fields are limited to the highest-value corrections for M1.5:
  - merchant
  - total
  - date
  - currency
  - category
- Expanded card actions:
  - `Done`
  - `Discard`
  - `Open full edit` (fallback to C5 for advanced/manual correction)
- `Done` only updates the local draft and collapses the card back into the tray. It does **not** persist the expense to the server.
- Only one card expanded at a time.

**Sticky footer:**

- Primary: `Save receipts` — visible if ≥1 `Ready` receipt exists.
- Secondary: `Review flagged receipts` — visible if ≥1 `Needs review` or `Failed` receipt exists.
- Footer copy should make the batch progress obvious, e.g. `4 ready · 2 need review`.
- `Save receipts` is the **single persistence action** for the tray. It saves only receipts currently considered safe to save. It does not force review of the rest.
- `Review flagged receipts` opens the first flagged receipt and then advances only through flagged receipts.

**State matrix:**

| State                      | Treatment                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Initial (all uploading)    | All cards skeleton merchant + "Uploading…" + spinner                                                               |
| Mixed processing           | Per-card status; footer shows progress summary like "3 ready · 1 processing · 2 need review"                       |
| Ready to save              | Primary footer action `Save receipts`                                                                              |
| Some flagged               | Secondary footer action `Review flagged receipts`; flagged receipts visually marked in place                       |
| All saved                  | Banner success "All 6 saved" + "Done" CTA → home                                                                   |
| Any failed                 | Failed receipts stay in place with Retry / Discard / Full edit                                                     |
| Empty (user discarded all) | EmptyState "Nothing to save yet" + "Add more" → re-opens picker                                                    |
| Offline                    | Banner info "Your selected receipts stay in a local draft on this device. Upload resumes when you're back online." |

### 5.3 C5 — Edit screen (batch-mode addendum)

Full-screen C5 becomes the **advanced/manual correction fallback**, not the normal path for every receipt.

When entered from the tray, C5 gets a **status row** above the form (replacing the page header):

- **Dot row** (max 8 dots): ✓ saved / ● current / ○ untouched / ⚠ flagged / × failed.
- Below dots: caption "Receipt {n} of {N} — {merchant}".
- Dots preserve original capture order.
- Dots are tappable → switch to that card without losing the current tray draft.
- Back arrow → returns to tray.

**Primary action label adapts to context:**

- Manual full-edit from tray: `Done`
- Flagged-review flow, more flagged cards remain: `Done & next flagged`
- Flagged-review flow, last flagged card: `Done & finish review`

These actions update the local tray draft. They do not persist expenses individually. Server persistence still happens through the tray-level `Save receipts` action.

All other C5 sections (Receipt / Items / Totals / Notes) unchanged from M1.

### 5.4 Flagged review flow

Triggered by `Review flagged receipts` on tray. Behavior delta from manual tap-in:

- Lands on the first receipt whose visible state is `Needs review` or `Failed`.
- After each `Done` action, auto-advances to the next flagged receipt only.
- `Ready` and `Saved` receipts are skipped.
- After the last flagged receipt is resolved, returns to tray.
- Back arrow exits flagged-review flow → tray.

### 5.5 Bulk save (ready receipts)

User taps `Save receipts` on tray:

- BottomSheet opens: "Save N ready receipts?" + supporting line: "Flagged receipts will stay in the inbox for review."
- Actions: `[Review flagged]` `[Save receipts]`.
- `Save receipts` → parallel save (concurrency cap 4); per-card status updates as each completes.
- `Review flagged` → enters flagged-review flow.
- Partial completion is allowed: users can save the obvious receipts now and return later to flagged ones.

### 5.6 Discard guards

- **Discard one card** (per-card menu): immediate, no confirm. Drafts are local until saved.
- **Discard all** (tray header): confirm sheet "Discard N receipts? This can't be undone." Persists `discarded_at` on the batch row if `serverId` exists.
- **Exit home with unsaved drafts**: confirm sheet "You have N unsaved receipts. `[Save now]` `[Keep working]` `[Discard batch]`."

### 5.7 Trip assignment

The batch supports two trip-assignment modes that ship together in M1.5: **batch mode** (one trip for all unsaved drafts) and **per-receipt mode** (each draft has its own trip).

**Default:** batch mode, current trip pre-selected. Most users finish a trip and upload receipts from that trip — zero friction.

**Trip-picker BottomSheet** (opens from tray header chip):

- Title: "Save these receipts to:"
- Body:
  - List of user's trips (`trips` table, owned or member). Single-select. Current trip pre-selected.
  - Footer toggle: **"Pick per receipt"** (off by default).
- Confirm button:
  - When toggle is off: "Save to {Selected Trip}" → all **unsaved** drafts in batch update their `tripId` to the selected trip. `BatchDraft.tripMode = 'batch'`.
  - When toggle is on: "Use per-receipt assignment" → `BatchDraft.tripMode = 'per_receipt'`. Tray refreshes; per-card trip chips appear (§5.7.1).

**5.7.1 Per-receipt mode UI**

- Each draft card grows a small trip chip below the merchant: "{Trip Name}" with chevron.
- Tap chip → opens trip-picker sheet scoped to that single card. Confirm updates only that card's `tripId`.
- C5 batch-mode status row mirrors the chip — same control, same trip-picker sheet, scoped to the current card.
- Saved receipts keep their committed `trip_id`; their chip is read-only.

**5.7.2 Tray header chip — adaptive copy**

| Batch state                                               | Header chip text                                         |
| --------------------------------------------------------- | -------------------------------------------------------- |
| All drafts → same trip, no saved receipts                 | "Save to {Trip}"                                         |
| All drafts → same trip, saved receipts split across trips | "{N saved to Bali} · {M ready for Kyoto}"                |
| Per-receipt mode, all unsaved drafts → same trip          | "All to {Trip}" with subtitle "Tap a receipt to change"  |
| Per-receipt mode, unsaved drafts spread across trips      | "Mixed trips" with subtitle "{N to Bali} · {M to Kyoto}" |

Tapping the chip always opens the batch-level trip-picker sheet (§5.7).

**5.7.3 Mode transitions**

- **Batch → per-receipt**: each draft retains its current `tripId`. No data change, just UI mode switch.
- **Per-receipt → batch**: confirm sheet "Switch to one trip for all unsaved receipts? This will set {N} receipts to {Selected Trip}." Avoids accidental override of carefully-set per-receipt trips.

**5.7.4 Default + zero-trip cases**

- New batch's drafts all inherit the user's current trip at picker time. `tripMode = 'batch'`.
- If the user has zero trips when starting a batch, force C3 trip-create sheet before tray loads (re-uses existing flow).

## 6. Data model

### 6.1 New table: `quick_capture_batches`

| field         | type               | notes                                    |
| ------------- | ------------------ | ---------------------------------------- |
| id            | uuid PK            |                                          |
| owner_user_id | uuid FK → users.id |                                          |
| created_at    | timestamptz        | default now()                            |
| image_count   | int                | 1–8, captured at creation, for analytics |
| confirmed_at  | timestamptz NULL   | populated when last expense saves        |
| discarded_at  | timestamptz NULL   | populated if user discards entire batch  |

**No `trip_id` column on the batch.** Trip lives on each expense (`expenses.trip_id`, already exists). This forward-supports the per-receipt mode where a batch may legitimately span trips.

**RLS:** owner-scoped. Only the batch owner can read/write rows. Trip members read individual `expenses` via existing RLS — they don't need batch metadata.

### 6.2 New column on `expenses`

`quick_capture_batch_id uuid NULL` — FK → `quick_capture_batches.id`.

Nullable: existing expenses + single-receipt scans have null. Index: `CREATE INDEX … ON expenses(quick_capture_batch_id) WHERE quick_capture_batch_id IS NOT NULL`.

### 6.3 Migration

New file: `supabase/migrations/{timestamp}_quick_capture_batches.sql`. Creates table + column + index + RLS.

## 7. Server orchestration

### 7.1 Upload (parallel)

- Endpoint: existing `app/api/upload+api.ts` (one file per call).
- Multi: client calls N times in parallel, with `Promise.allSettled` to isolate failures.
- **Concurrency cap: 4** (client-side semaphore). Prevents head-of-line blocking on slow connections.

### 7.2 Extraction (parallel)

- Endpoint: existing `app/api/extract+api.ts`.
- Same parallel pattern, **cap: 4** to stay within Gemini-via-OpenRouter free-tier headroom.

### 7.3 Save

- Endpoint: existing `app/api/expenses+api.ts` (`save_expense_with_items` RPC).
- Bulk save: client calls N times in parallel, **cap: 4**. Each successful save returns the new expense id; client updates the tray.
- **Not in scope:** server-side bulk RPC (`save_expenses_with_items(payload jsonb[])`). Defer post-launch optimization.

### 7.4 Batch lifecycle

- Batch row created on **first successful upload** (not on picker close — avoids orphans if user cancels mid-tray before any upload completes).
- `confirmed_at` set when last expense in the batch saves successfully.
- `discarded_at` set on discard-all + confirm.

## 8. Client state model

### 8.1 Draft expense

```ts
type DraftExpense = {
  id: string; // local uuid
  imageUri: string; // local file URI before upload
  tripId: string; // populated at batch creation; per-receipt override-ready
  status:
    | 'pending_upload'
    | 'uploading'
    | 'upload_failed'
    | 'extracting'
    | 'extract_failed'
    | 'ready'
    | 'saving'
    | 'saved'
    | 'discarded';
  reviewState: 'none' | 'needs_review' | 'failed'; // user-facing review grouping lives here
  uploadedKey: string | null; // Supabase Storage path after upload
  extracted: ExtractedExpense | null; // populated after extract
  expenseId: string | null; // server expense id after save
  error: { code: string; message: string } | null;
  retryCount: number;
};
```

**`tripId` is per-draft from day one** — even though M1.5 UI keeps all unsaved drafts in lockstep by default, the state shape supports per-receipt override without migration.

**User-facing state is intentionally simpler than transport state.**

- `status` is the orchestration state.
- `reviewState` is the inbox/review state.
- A receipt can be `status: ready` and `reviewState: needs_review` at the same time. This is how low-confidence extraction is surfaced under that specific receipt.

### 8.2 Batch draft

```ts
type BatchDraft = {
  id: string; // local uuid; replaced with server uuid after first upload
  serverId: string | null; // quick_capture_batches.id once persisted
  defaultTripId: string; // current trip at batch creation; new drafts inherit
  tripMode: 'batch' | 'per_receipt'; // M1.5: ships with both modes
  createdAt: string; // ISO
  drafts: DraftExpense[];
  mode: 'tray' | 'flagged_review';
  cursorIndex: number; // for dot-row + flagged review
};
```

**No single `tripId` field on the batch** — the source of truth is each draft's `tripId`. `defaultTripId` is just the inherit-from value for newly-added drafts (not used in M1.5 since picker is one-shot, but reserved for the post-MVP "add more" flow).

When user taps tray-header trip chip and selects a different trip, **iterate drafts and update each `tripId`**. This keeps the batch-mode UX while the underlying state is per-draft.

### 8.3 Persistence

- Storage: `expo-secure-store`, key `quick_capture_batch_v1`.
- **Single in-flight batch at a time** for M1.5 (simplification — multi-batch is post-MVP).
- Persist the batch draft periodically while the tray is active:
  - after every extraction result
  - after every inline edit change (debounced)
  - after every trip change
  - after every status transition
  - on app background
- Debounce write frequency so persistence is resilient but not wasteful, e.g. ~500ms after the latest local change.
- Restored on app launch; tray re-opens if any draft is in a non-terminal state.
- Cleared when all drafts reach `saved` or `discarded`.

### 8.4 Lifecycle hooks

| Event                                  | Behavior                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App backgrounded mid-upload/extraction | Latest local draft is already persisted; foreground resumes work where possible                                                                                                                                            |
| App killed                             | On next launch, the batch inbox restores from local draft storage; drafts in `uploading`/`extracting` revert to `pending_upload` and retry; stale image URIs move the receipt to `upload_failed` with "Re-pick" affordance |
| Network reconnect after offline        | Drafts retry once automatically; tray banner explains that upload has resumed                                                                                                                                              |

## 9. AI prompts

**No prompt changes.** Each receipt is a fully-independent extract call against the existing single-receipt prompt + schema (per `docs/ai-prompts.md`).

Append a "Parallel orchestration" section to `docs/ai-prompts.md`: documents concurrency cap (4), failure isolation (one bad receipt doesn't block siblings), and the cost note (8 images = up to 8 Gemini calls; free tier headroom validated at this cap).

## 10. Errors + edge cases

| Case                               | Handling                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Picker cancel                      | No tray; stay on home                                                                                       |
| 1 image picked                     | Existing C4 flow (no regression)                                                                            |
| >8 images picked                   | Picker enforces; if platform ignores, client truncates first 8 + toast "Only the first 8 will be processed" |
| User has zero trips at picker time | Force C3 trip-create sheet before tray loads                                                                |
| Upload fails                       | Receipt stays in capture order; `Failed` under that receipt + Retry / Discard                               |
| Low-confidence extraction          | Receipt stays in capture order; `Needs review` under that receipt + quick inline edit affordance            |
| Extraction fails                   | Receipt stays in capture order; `Needs review` under that receipt + Full edit / Discard                     |
| Save fails                         | Optimistic save rolls back; banner inside C5                                                                |
| Network drops mid-batch            | Local draft remains; tray banner "You're offline — upload resumes when you're back online"                  |
| Force-close mid-batch              | Relaunch restores batch from secure-store; in-flight cards retried per §8.4                                 |
| User changes trip mid-batch        | Unsaved drafts' `tripId` updates; saved receipts are shown in explicit split state and are not moved        |
| Discard all                        | Tray empties; mark `discarded_at` if `serverId` exists; nav home                                            |
| Exit home with unsaved drafts      | Confirm sheet (§5.6)                                                                                        |
| Image too large                    | Existing upload endpoint handles; if rejected, card → `upload_failed` with size note                        |

## 11. Telemetry

DEBUG-level only; PII scrubbed per CLAUDE.md privacy rules.

- `quick_capture.batch_started` — `image_count`
- `quick_capture.draft_status_changed` — `from`, `to`
- `quick_capture.trip_changed` — `before_count`, `after_count` (count of drafts affected)
- `quick_capture.bulk_save_receipts` — `count`
- `quick_capture.batch_completed` — `image_count`, `time_to_first_save_ms`, `time_to_all_saved_ms`

## 12. Acceptance criteria

- User picks 6 receipts → lands on tray with 6 cards within 1s of picker close.
- All 6 cards reach `ready`, `needs_review`, or terminal error state in ≤30s on a 4G connection.
- Tray header shows trip chip with current trip name; tapping opens trip picker.
- Changing trip in picker (batch mode) updates all unsaved cards' `tripId`; saved cards are not moved and split state is shown explicitly.
- Toggling "Pick per receipt" in trip picker switches `BatchDraft.tripMode` to `per_receipt`; per-card trip chips appear on draft cards and in C5 status row.
- In per-receipt mode, tapping a per-card trip chip opens trip-picker scoped to that card; confirming updates only that card's `tripId`.
- Tray header chip text adapts to mixed-trip state per §5.7.2.
- Switching from per-receipt back to batch mode shows confirm sheet before overriding per-card trips.
- User can edit or expand any receipt in capture order without losing other receipts' state.
- `Needs review` is shown under each flagged receipt rather than by reordering the tray.
- `Save receipts` saves N ready receipts with one inline confirm; tray updates per-card as each completes.
- `Review flagged receipts` advances only through receipts that still need review.
- Force-quit during processing → relaunch restores the tray with consistent state (no duplicate uploads, no lost drafts, `tripMode` preserved).
- Discard-all empties the tray and persists `discarded_at` server-side.
- Batch undo: detail screen of a saved expense shows "View batch" affordance for 24h post-save.
- Single-receipt flow (1 image picked) is byte-identical to M1 — zero regressions.
- DB: each saved expense has its own `trip_id`; `quick_capture_batches` has no `trip_id` column (batches may legitimately span trips).

## 13. Touchpoints — files to update / create

**Doc updates (after this spec is accepted):**

- `CLAUDE.md` — add Quick capture to in-scope; new M1.5 line in milestone scope.
- `docs/design-system.md` — add §C4b (Batch tray) with state matrix; §C5 batch-mode addendum; new dot-row pattern; trip-chip pattern.
- `docs/data-model.md` — `quick_capture_batches` + `expenses.quick_capture_batch_id`.
- `docs/ai-prompts.md` — append "Parallel orchestration" section.
- `docs/decisions/0010-quick-capture.md` — new ADR capturing inbox-tray model, milestone slot, 8-cap, device-only-drafts, naming, trip-assignment forward-compat shape.

**Code:**

- `supabase/migrations/{timestamp}_quick_capture_batches.sql` — new
- `lib/quick-capture/state.ts` — types + reducer (DraftExpense, BatchDraft, status transitions, trip-update action)
- `lib/quick-capture/orchestrator.ts` — parallel upload + extract + save with concurrency cap
- `lib/quick-capture/persist.ts` — `expo-secure-store` read/write
- `lib/quick-capture/__tests__/` — vitest suites for reducer + orchestrator
- `app/(tabs)/quick-capture/index.tsx` — C4b tray screen
- `app/(tabs)/quick-capture/[draftId].tsx` — C5 batch-mode wrapper around existing edit form
- `components/ui/dot-row.tsx` — new primitive (reusable beyond Quick capture)
- `components/quick-capture/draft-card.tsx` — tray row component
- `components/quick-capture/trip-picker-sheet.tsx` — trip selection BottomSheet with "Pick per receipt" toggle. Two scopes: batch (header chip) and single-card (per-receipt chip). Same component, scoped via prop.

## 14. Roles

- **Zephan** — review spec, approve scope, gate Codex hand-off, run `/codex` and `/ux-audit`.
- **Claude** — write spec; build functional **mockup** (behaviorally correct, design-system-aligned but not pixel-final); implement **underlying logic** (orchestrator, state machine, persistence, DB migration, reducer tests).
- **Codex** — visual implementation against the refreshed editorial design system; UI polish; layout and art direction.

## 15. Sequencing for implementation

Each step independently shippable. Suggested order:

1. **DB migration** (`quick_capture_batches` table + column + RLS) — no UI dependency.
2. **`lib/quick-capture/`** — types, reducer, persistence, orchestrator. Tested in isolation with vitest.
3. **Mockup** — bare-bones C4b tray + C5 batch-mode chrome (Claude). Wires logic to UI shell.
4. **Codex review + visual implementation** — re-skin against editorial design system.
5. **End-to-end pass** — Playwright self-verify across states; user testing on a real batch of receipts.

Each step has acceptance criteria from §12 it must satisfy.

## 16. Cross-trip batch support (load-bearing design choices)

A batch may legitimately span trips (per-receipt mode, §5.7). The data model and state shape support this without special-casing:

- `quick_capture_batches` has **no** `trip_id` column (§6.1). Trip lives per expense.
- `expenses.trip_id` already varies per row (existing M1 column).
- `DraftExpense.tripId` is per-draft from day one (§8.1).
- `BatchDraft.tripMode` distinguishes batch vs per-receipt UX (§8.2).

These choices keep the schema clean and let "View batch" lookups walk `expenses` filtered by `quick_capture_batch_id` regardless of how many trips the batch touches.
