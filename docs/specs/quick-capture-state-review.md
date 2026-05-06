# Quick Capture — State Machine Review

Purpose: validate that the locked UX model maps cleanly to implementable state without hidden contradictions.

## 1. Principle

There are two different layers of state:

- orchestration state: what the system is doing
- review state: what the user needs to know

Do not collapse them into one enum.

## 2. Draft Expense Model

Recommended shape:

```ts
type DraftExpenseStatus =
  | 'pending_upload'
  | 'uploading'
  | 'upload_failed'
  | 'extracting'
  | 'extract_failed'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'discarded';

type DraftExpenseReviewState = 'none' | 'needs_review' | 'failed';
```

Interpretation:

- `status` drives orchestration and retries
- `reviewState` drives what appears in the tray UI

Example:

- a receipt can be `status: 'ready'` and `reviewState: 'needs_review'`
- that means extraction finished, but user attention is still required

## 3. Visible Tray Mapping

Map internal state to visible state like this:

- `uploading` / `extracting` → `Processing`
- `ready + reviewState:none` → `Ready`
- `ready + reviewState:needs_review` → `Needs review`
- `saved` → `Saved`
- `upload_failed` / `extract_failed` / `reviewState:failed` → `Failed`

This keeps the user-facing model simple.

## 4. Save Semantics

Important rule:

- only tray-level `Save receipts` persists expenses to the server

Implications:

- inline expansion `Done` updates local draft only
- full-screen C5 `Done` updates local draft only
- `Save receipts` selects all currently saveable receipts and persists them

This avoids ambiguous partial-save behavior.

## 5. Flagged Review Flow

Batch mode should only use:

```ts
type BatchDraftMode = 'tray' | 'flagged_review';
```

There is no generic wizard anymore.

Flagged-review flow:

- enters first flagged receipt
- advances only through flagged receipts
- returns to tray when resolved

## 6. Persistence Triggers

Persist local batch draft on:

- extraction result
- trip change
- status transition
- inline edit change, debounced
- app background

This is required for trust.

## 7. Mixed Trip State

Once some receipts are saved:

- saved receipts are immutable from the batch perspective
- trip chip updates affect unsaved receipts only
- tray header must be able to represent mixed state

The state model already supports this because `tripId` lives per draft.

## 8. Partial Completion

Partial completion is allowed.

Meaning:

- some receipts may be `saved`
- some may remain `needs_review`
- some may still be `processing`

This is compatible with the inbox model and should not be treated as an error.

## 9. Implementation Warning

Do not reintroduce these anti-patterns:

- confidence-based tray sorting
- per-card save-to-server actions
- one giant enum that mixes orchestration and review semantics
- wizard progress over all receipts regardless of status
