// Quick capture orchestrator — side-effecting parallel runners with a
// concurrency cap. Pure DI: caller injects `OrchestratorDeps` so tests can
// substitute fakes. No React, no AsyncStorage, no networking primitives —
// just a thin glue between the reducer and the upload/extract/save endpoints.
//
// Concurrency cap = 4 across all phases (per docs/specs/quick-capture.md
// §7.1, §7.2, §7.3). Single inline semaphore; we don't pull a dep for this.

import type { ExtractedExpense } from '@/lib/ai/schema';

import type { Action, BatchDraft, DraftError, DraftExpense } from './state';

export type Dispatch = (action: Action) => void;

export type OrchestratorDeps = {
  uploadImage: (imageUri: string) => Promise<{ uploadedKey: string }>;
  extractReceipt: (uploadedKey: string) => Promise<{ extracted: ExtractedExpense }>;
  saveExpense: (draft: DraftExpense) => Promise<{ expenseId: string }>;
};

export const CONCURRENCY_CAP = 4;

// ─── Semaphore ───────────────────────────────────────────────────────────

/**
 * Run an array of async tasks with a hard concurrency cap. Equivalent to
 * `Promise.allSettled` over a chunked work-stealing pool. Each task runs to
 * completion (resolve OR reject) — nothing is cancelled mid-flight.
 *
 * We don't propagate rejections out of this helper because the orchestrator
 * surfaces failures via dispatch actions, not exceptions.
 */
async function runWithCap<T>(
  tasks: (() => Promise<T>)[],
  cap: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next;
      next += 1;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] = { status: 'fulfilled', value };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(cap, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Exported only for tests — lets us validate the cap is respected.
export const __test_runWithCap = runWithCap;

// ─── Error mapping ───────────────────────────────────────────────────────

function toDraftError(err: unknown, fallbackCode: string): DraftError {
  if (err instanceof Error) {
    return { code: fallbackCode, message: err.message };
  }
  if (typeof err === 'string') {
    return { code: fallbackCode, message: err };
  }
  return { code: fallbackCode, message: 'Unknown error' };
}

// ─── Upload phase ────────────────────────────────────────────────────────

/**
 * Run uploads for every draft in `pending_upload`. Dispatches START before
 * each call and SUCCEEDED / FAILED on completion. Returns when all chosen
 * drafts have settled. Safe to re-invoke — drafts that aren't in
 * `pending_upload` are skipped.
 */
export async function runUploads(
  state: BatchDraft,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  const targets = state.drafts.filter((d) => d.status === 'pending_upload');
  await runWithCap(
    targets.map((d) => async () => {
      dispatch({ type: 'UPLOAD_STARTED', draftId: d.id });
      try {
        const { uploadedKey } = await deps.uploadImage(d.imageUri);
        dispatch({ type: 'UPLOAD_SUCCEEDED', draftId: d.id, uploadedKey });
      } catch (err) {
        dispatch({
          type: 'UPLOAD_FAILED',
          draftId: d.id,
          error: toDraftError(err, 'UPLOAD_FAILED'),
        });
      }
    }),
    CONCURRENCY_CAP,
  );
}

// ─── Extraction phase ────────────────────────────────────────────────────

/**
 * Run extractions for every draft in `extracting` that has an `uploadedKey`.
 * The reducer transitions a draft to `extracting` immediately on UPLOAD_SUCCEEDED
 * so the orchestrator just needs to find them and call out.
 */
export async function runExtractions(
  state: BatchDraft,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  const targets = state.drafts.filter(
    (d) => d.status === 'extracting' && d.uploadedKey !== null && d.extracted === null,
  );
  await runWithCap(
    targets.map((d) => async () => {
      dispatch({ type: 'EXTRACT_STARTED', draftId: d.id });
      try {
        const uploadedKey = d.uploadedKey;
        if (uploadedKey === null) throw new Error('uploadedKey missing');
        const { extracted } = await deps.extractReceipt(uploadedKey);
        dispatch({ type: 'EXTRACT_SUCCEEDED', draftId: d.id, extracted });
      } catch (err) {
        dispatch({
          type: 'EXTRACT_FAILED',
          draftId: d.id,
          error: toDraftError(err, 'EXTRACT_FAILED'),
        });
      }
    }),
    CONCURRENCY_CAP,
  );
}

// ─── Save phase ──────────────────────────────────────────────────────────

/**
 * Bulk-save action invoked by `Save receipts` on the tray (§5.5). Saves only
 * drafts whose visible state is `Ready` — i.e., `status: ready` and
 * `reviewState: none`. Failed siblings are left in place for the user to
 * retry from the tray; success siblings stay `Saved`.
 */
export async function runSaves(
  state: BatchDraft,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  const targets = state.drafts.filter((d) => d.status === 'ready' && d.reviewState === 'none');
  await runWithCap(
    targets.map((d) => async () => {
      dispatch({ type: 'SAVE_STARTED', draftId: d.id });
      try {
        const { expenseId } = await deps.saveExpense(d);
        dispatch({ type: 'SAVE_SUCCEEDED', draftId: d.id, expenseId });
      } catch (err) {
        dispatch({
          type: 'SAVE_FAILED',
          draftId: d.id,
          error: toDraftError(err, 'SAVE_FAILED'),
        });
      }
    }),
    CONCURRENCY_CAP,
  );
}

// ─── Cause-aware single-draft retries (§5.2) ─────────────────────────────

/**
 * Retry the upload for a single draft. The card must currently be
 * `upload_failed`. Returns silently for any other status — caller controls
 * UX, this just runs the work.
 */
export async function retryUpload(
  draft: DraftExpense,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  if (draft.status !== 'upload_failed') return;
  dispatch({ type: 'UPLOAD_STARTED', draftId: draft.id });
  try {
    const { uploadedKey } = await deps.uploadImage(draft.imageUri);
    dispatch({ type: 'UPLOAD_SUCCEEDED', draftId: draft.id, uploadedKey });
  } catch (err) {
    dispatch({
      type: 'UPLOAD_FAILED',
      draftId: draft.id,
      error: toDraftError(err, 'UPLOAD_FAILED'),
    });
  }
}

/**
 * Retry the extraction for a single draft. Card must currently be
 * `extract_failed` and have an `uploadedKey`.
 */
export async function retryExtraction(
  draft: DraftExpense,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  if (draft.status !== 'extract_failed' || draft.uploadedKey === null) return;
  dispatch({ type: 'EXTRACT_STARTED', draftId: draft.id });
  try {
    const { extracted } = await deps.extractReceipt(draft.uploadedKey);
    dispatch({ type: 'EXTRACT_SUCCEEDED', draftId: draft.id, extracted });
  } catch (err) {
    dispatch({
      type: 'EXTRACT_FAILED',
      draftId: draft.id,
      error: toDraftError(err, 'EXTRACT_FAILED'),
    });
  }
}

/**
 * Retry a single failed save. Used when `SAVE_FAILED` left the draft in
 * `ready + reviewState=failed`; user taps retry on the tray card.
 */
export async function retrySave(
  draft: DraftExpense,
  dispatch: Dispatch,
  deps: OrchestratorDeps,
): Promise<void> {
  if (draft.status !== 'ready' || draft.reviewState !== 'failed') return;
  dispatch({ type: 'SAVE_STARTED', draftId: draft.id });
  try {
    const { expenseId } = await deps.saveExpense(draft);
    dispatch({ type: 'SAVE_SUCCEEDED', draftId: draft.id, expenseId });
  } catch (err) {
    dispatch({
      type: 'SAVE_FAILED',
      draftId: draft.id,
      error: toDraftError(err, 'SAVE_FAILED'),
    });
  }
}
