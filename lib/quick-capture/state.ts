// Quick capture state — pure types, reducer, and helpers. No side effects.
//
// Two-layer state model (per docs/specs/quick-capture.md §8.1):
//   - `status` is the orchestration axis (upload → extract → save lifecycle).
//   - `reviewState` is the inbox/UX axis (none / needs_review / failed).
//   They move independently. A receipt can be `status: ready` and
//   `reviewState: needs_review` at the same time — that's how low-confidence
//   extraction is surfaced under a specific receipt without reordering the tray.

import type { ExtractedExpense } from '@/lib/ai/schema';

// ─── Types ───────────────────────────────────────────────────────────────

export type DraftStatus =
  | 'pending_upload'
  | 'uploading'
  | 'upload_failed'
  | 'extracting'
  | 'extract_failed'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'discarded';

export type ReviewState = 'none' | 'needs_review' | 'failed';

export type DraftError = { code: string; message: string };

export type DraftExpense = {
  id: string;
  imageUri: string;
  tripId: string;
  status: DraftStatus;
  reviewState: ReviewState;
  uploadedKey: string | null;
  extracted: ExtractedExpense | null;
  expenseId: string | null;
  error: DraftError | null;
  retryCount: number;
};

export type TripMode = 'batch' | 'per_receipt';

export type BatchMode = 'tray' | 'flagged_review';

export type BatchDraft = {
  id: string;
  serverId: string | null;
  defaultTripId: string;
  tripMode: TripMode;
  createdAt: string;
  drafts: DraftExpense[];
  mode: BatchMode;
  cursorIndex: number;
};

// ─── Visible status (UI mapping per §5.2) ────────────────────────────────

export type VisibleStatus = 'processing' | 'ready' | 'needs_review' | 'saved' | 'failed';

export function visibleStatusOf(d: DraftExpense): VisibleStatus {
  if (d.status === 'saved') return 'saved';
  if (d.status === 'upload_failed' || d.status === 'extract_failed') return 'failed';
  if (d.reviewState === 'failed') return 'failed';
  if (d.status === 'ready' && d.reviewState === 'needs_review') return 'needs_review';
  if (d.status === 'ready') return 'ready';
  // pending_upload, uploading, extracting, saving
  return 'processing';
}

// Confidence threshold below which extraction is flagged for review per §5.2.
// Inline edits to the flagged fields clear `needs_review` since the editable
// fields ARE the review surface.
export const NEEDS_REVIEW_CONFIDENCE_THRESHOLD = 0.7;

// Max receipts in one batch per spec §5.1.
export const MAX_BATCH_IMAGES = 8;

export function shouldFlagForReview(extracted: ExtractedExpense): boolean {
  if (extracted.confidence.overall < NEEDS_REVIEW_CONFIDENCE_THRESHOLD) return true;
  if (!extracted.merchant.trim()) return true;
  if (extracted.total_cents <= 0) return true;
  return false;
}

// ─── Action union ────────────────────────────────────────────────────────

export type InitBatchImage = { id: string; imageUri: string };

export type Action =
  | {
      type: 'INIT_BATCH';
      batchId: string;
      defaultTripId: string;
      images: InitBatchImage[];
      createdAt: string;
    }
  | { type: 'BATCH_SERVER_ID_SET'; serverId: string }
  | { type: 'UPLOAD_STARTED'; draftId: string }
  | { type: 'UPLOAD_SUCCEEDED'; draftId: string; uploadedKey: string }
  | { type: 'UPLOAD_FAILED'; draftId: string; error: DraftError }
  | { type: 'EXTRACT_STARTED'; draftId: string }
  | { type: 'EXTRACT_SUCCEEDED'; draftId: string; extracted: ExtractedExpense }
  | { type: 'EXTRACT_FAILED'; draftId: string; error: DraftError }
  | { type: 'APPLY_INLINE_EDIT'; draftId: string; patch: Partial<ExtractedExpense> }
  | { type: 'SET_TRIP_FOR_DRAFT'; draftId: string; tripId: string }
  | { type: 'SET_TRIP_FOR_BATCH'; tripId: string }
  | { type: 'SET_TRIP_MODE'; tripMode: TripMode }
  | { type: 'SAVE_STARTED'; draftId: string }
  | { type: 'SAVE_SUCCEEDED'; draftId: string; expenseId: string }
  | { type: 'SAVE_FAILED'; draftId: string; error: DraftError }
  | { type: 'DISCARD_DRAFT'; draftId: string }
  | { type: 'DISCARD_ALL' }
  | { type: 'ENTER_FLAGGED_REVIEW' }
  | { type: 'EXIT_FLAGGED_REVIEW' }
  | { type: 'SET_CURSOR'; index: number };

// ─── Reducer ─────────────────────────────────────────────────────────────

export function reducer(state: BatchDraft, action: Action): BatchDraft {
  switch (action.type) {
    case 'INIT_BATCH':
      return {
        id: action.batchId,
        serverId: null,
        defaultTripId: action.defaultTripId,
        tripMode: 'batch',
        createdAt: action.createdAt,
        drafts: action.images.map((img) => ({
          id: img.id,
          imageUri: img.imageUri,
          tripId: action.defaultTripId,
          status: 'pending_upload',
          reviewState: 'none',
          uploadedKey: null,
          extracted: null,
          expenseId: null,
          error: null,
          retryCount: 0,
        })),
        mode: 'tray',
        cursorIndex: 0,
      };

    case 'BATCH_SERVER_ID_SET':
      return { ...state, serverId: action.serverId };

    case 'UPLOAD_STARTED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'uploading',
        error: null,
      }));

    case 'UPLOAD_SUCCEEDED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'extracting', // upload done; extraction follows immediately
        uploadedKey: action.uploadedKey,
      }));

    case 'UPLOAD_FAILED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'upload_failed',
        error: action.error,
        retryCount: d.retryCount + 1,
      }));

    case 'EXTRACT_STARTED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'extracting',
        error: null,
      }));

    case 'EXTRACT_SUCCEEDED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'ready',
        reviewState: shouldFlagForReview(action.extracted) ? 'needs_review' : 'none',
        extracted: action.extracted,
        error: null,
      }));

    case 'EXTRACT_FAILED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'extract_failed',
        error: action.error,
        retryCount: d.retryCount + 1,
      }));

    case 'APPLY_INLINE_EDIT':
      return mapDraft(state, action.draftId, (d) => {
        // The inline-editable fields per §5.2 (merchant/total/date/currency/category)
        // ARE the review surface — touching any of them clears `needs_review`.
        // Status is left alone; saving still goes through the bulk-save action.
        if (!d.extracted) return d;
        return {
          ...d,
          extracted: { ...d.extracted, ...action.patch },
          reviewState: d.reviewState === 'needs_review' ? 'none' : d.reviewState,
        };
      });

    case 'SET_TRIP_FOR_DRAFT':
      return mapDraft(state, action.draftId, (d) => {
        // Saved drafts keep their committed trip per §5.7.1 — no-op here.
        if (d.status === 'saved') return d;
        return { ...d, tripId: action.tripId };
      });

    case 'SET_TRIP_FOR_BATCH':
      return {
        ...state,
        drafts: state.drafts.map((d) =>
          d.status === 'saved' ? d : { ...d, tripId: action.tripId },
        ),
      };

    case 'SET_TRIP_MODE':
      return { ...state, tripMode: action.tripMode };

    case 'SAVE_STARTED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'saving',
        error: null,
      }));

    case 'SAVE_SUCCEEDED':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'saved',
        reviewState: 'none',
        expenseId: action.expenseId,
      }));

    case 'SAVE_FAILED':
      // Per §5.5: saved siblings stay saved; failed ones return to the tray
      // visible-state `Failed` so the user can retry without being pushed
      // into C5. Status returns to `ready` so retry-save is a clean re-entry.
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'ready',
        reviewState: 'failed',
        error: action.error,
        retryCount: d.retryCount + 1,
      }));

    case 'DISCARD_DRAFT':
      return mapDraft(state, action.draftId, (d) => ({
        ...d,
        status: 'discarded',
      }));

    case 'DISCARD_ALL':
      return {
        ...state,
        drafts: state.drafts.map((d) => (d.status === 'saved' ? d : { ...d, status: 'discarded' })),
        mode: 'tray',
      };

    case 'ENTER_FLAGGED_REVIEW': {
      const next = nextFlaggedIndex(state, -1);
      if (next === null) return state; // nothing to review
      return { ...state, mode: 'flagged_review', cursorIndex: next };
    }

    case 'EXIT_FLAGGED_REVIEW':
      return { ...state, mode: 'tray' };

    case 'SET_CURSOR':
      return { ...state, cursorIndex: clampIndex(state.drafts.length, action.index) };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function mapDraft(
  state: BatchDraft,
  draftId: string,
  fn: (d: DraftExpense) => DraftExpense,
): BatchDraft {
  const idx = state.drafts.findIndex((d) => d.id === draftId);
  if (idx === -1) return state;
  const next = state.drafts.slice();
  next[idx] = fn(state.drafts[idx]);
  return { ...state, drafts: next };
}

function clampIndex(length: number, i: number): number {
  if (length === 0) return 0;
  if (i < 0) return 0;
  if (i >= length) return length - 1;
  return i;
}

export function isFlagged(d: DraftExpense): boolean {
  const v = visibleStatusOf(d);
  return v === 'needs_review' || v === 'failed';
}

/**
 * Find the next flagged draft index strictly after `fromIndex`. Returns null
 * if no flagged draft remains. Used by the flagged-review flow (§5.4).
 */
export function nextFlaggedIndex(state: BatchDraft, fromIndex: number): number | null {
  for (let i = fromIndex + 1; i < state.drafts.length; i += 1) {
    const d = state.drafts[i];
    if (d.status === 'discarded') continue;
    if (isFlagged(d)) return i;
  }
  return null;
}

export function readyDraftCount(state: BatchDraft): number {
  return state.drafts.filter((d) => visibleStatusOf(d) === 'ready').length;
}

export function flaggedDraftCount(state: BatchDraft): number {
  return state.drafts.filter((d) => isFlagged(d)).length;
}

export function processingDraftCount(state: BatchDraft): number {
  return state.drafts.filter((d) => visibleStatusOf(d) === 'processing').length;
}

export function savedDraftCount(state: BatchDraft): number {
  return state.drafts.filter((d) => d.status === 'saved').length;
}

export function activeDraftCount(state: BatchDraft): number {
  return state.drafts.filter((d) => d.status !== 'discarded').length;
}

export function hasUnsavedDrafts(state: BatchDraft): boolean {
  return state.drafts.some((d) => d.status !== 'saved' && d.status !== 'discarded');
}

export function isBatchTerminal(state: BatchDraft): boolean {
  return state.drafts.every((d) => d.status === 'saved' || d.status === 'discarded');
}
