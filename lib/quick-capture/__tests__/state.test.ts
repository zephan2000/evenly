import { describe, expect, it } from 'vitest';

import type { ExtractedExpense } from '@/lib/ai/schema';

import {
  type Action,
  type BatchDraft,
  type DraftExpense,
  flaggedDraftCount,
  hasUnsavedDrafts,
  isBatchTerminal,
  isFlagged,
  NEEDS_REVIEW_CONFIDENCE_THRESHOLD,
  nextFlaggedIndex,
  processingDraftCount,
  readyDraftCount,
  reducer,
  savedDraftCount,
  shouldFlagForReview,
  visibleStatusOf,
} from '../state';

// ─── Fixtures ────────────────────────────────────────────────────────────

function highConfidenceExtracted(overrides: Partial<ExtractedExpense> = {}): ExtractedExpense {
  return {
    merchant: 'Hawker Heaven',
    expense_date: '2026-05-04',
    currency: 'SGD',
    tax_mode: 'exclusive',
    tax_label: 'GST',
    items: [{ name: 'Chicken Rice', quantity: 1, unit_amount_cents: 600, amount_cents: 600 }],
    subtotal_cents: 600,
    service_charge_cents: 60,
    tip_cents: 0,
    tax_amount_cents: 53,
    total_cents: 713,
    category_guess: 'meals',
    confidence: { overall: 0.92, items: 0.9, totals: 0.95 },
    notes: '',
    ...overrides,
  };
}

function lowConfidenceExtracted(): ExtractedExpense {
  return highConfidenceExtracted({
    confidence: { overall: 0.5, items: 0.6, totals: 0.5 },
  });
}

function initBatch(imageCount: number): BatchDraft {
  return reducer(emptyBatch(), {
    type: 'INIT_BATCH',
    batchId: 'batch-1',
    defaultTripId: 'trip-bali',
    images: Array.from({ length: imageCount }, (_, i) => ({
      id: `draft-${i}`,
      imageUri: `file://image-${i}.jpg`,
    })),
    createdAt: '2026-05-06T12:00:00.000Z',
  });
}

function emptyBatch(): BatchDraft {
  return {
    id: '',
    serverId: null,
    defaultTripId: '',
    tripMode: 'batch',
    createdAt: '',
    drafts: [],
    mode: 'tray',
    cursorIndex: 0,
  };
}

// ─── shouldFlagForReview ─────────────────────────────────────────────────

describe('shouldFlagForReview', () => {
  it('flags low overall confidence', () => {
    expect(shouldFlagForReview(lowConfidenceExtracted())).toBe(true);
  });

  it('does not flag high overall confidence', () => {
    expect(shouldFlagForReview(highConfidenceExtracted())).toBe(false);
  });

  it('flags missing merchant even with high confidence', () => {
    expect(shouldFlagForReview(highConfidenceExtracted({ merchant: '   ' }))).toBe(true);
  });

  it('flags total <= 0', () => {
    expect(shouldFlagForReview(highConfidenceExtracted({ total_cents: 0 }))).toBe(true);
  });

  it('threshold is exposed as a constant', () => {
    expect(NEEDS_REVIEW_CONFIDENCE_THRESHOLD).toBe(0.7);
  });
});

// ─── visibleStatusOf ─────────────────────────────────────────────────────

describe('visibleStatusOf', () => {
  function draft(partial: Partial<DraftExpense>): DraftExpense {
    return {
      id: 'd',
      imageUri: '',
      tripId: 't',
      status: 'pending_upload',
      reviewState: 'none',
      uploadedKey: null,
      extracted: null,
      expenseId: null,
      error: null,
      retryCount: 0,
      ...partial,
    };
  }

  it('returns processing for orchestration-in-flight states', () => {
    expect(visibleStatusOf(draft({ status: 'pending_upload' }))).toBe('processing');
    expect(visibleStatusOf(draft({ status: 'uploading' }))).toBe('processing');
    expect(visibleStatusOf(draft({ status: 'extracting' }))).toBe('processing');
    expect(visibleStatusOf(draft({ status: 'saving' }))).toBe('processing');
  });

  it('returns ready when status=ready and reviewState=none', () => {
    expect(visibleStatusOf(draft({ status: 'ready', reviewState: 'none' }))).toBe('ready');
  });

  it('returns needs_review when status=ready and reviewState=needs_review', () => {
    expect(visibleStatusOf(draft({ status: 'ready', reviewState: 'needs_review' }))).toBe(
      'needs_review',
    );
  });

  it('returns failed for upload_failed and extract_failed', () => {
    expect(visibleStatusOf(draft({ status: 'upload_failed' }))).toBe('failed');
    expect(visibleStatusOf(draft({ status: 'extract_failed' }))).toBe('failed');
  });

  it('returns failed when reviewState=failed regardless of status', () => {
    expect(visibleStatusOf(draft({ status: 'ready', reviewState: 'failed' }))).toBe('failed');
  });

  it('returns saved for status=saved', () => {
    expect(visibleStatusOf(draft({ status: 'saved' }))).toBe('saved');
  });
});

// ─── INIT_BATCH ──────────────────────────────────────────────────────────

describe('INIT_BATCH', () => {
  it('creates drafts in pending_upload with default trip', () => {
    const state = initBatch(3);
    expect(state.drafts).toHaveLength(3);
    expect(state.drafts.every((d) => d.status === 'pending_upload')).toBe(true);
    expect(state.drafts.every((d) => d.tripId === 'trip-bali')).toBe(true);
    expect(state.drafts.every((d) => d.reviewState === 'none')).toBe(true);
    expect(state.tripMode).toBe('batch');
    expect(state.mode).toBe('tray');
    expect(state.cursorIndex).toBe(0);
  });
});

// ─── Status transitions ──────────────────────────────────────────────────

describe('reducer status transitions', () => {
  it('UPLOAD_STARTED → uploading', () => {
    const s1 = initBatch(1);
    const s2 = reducer(s1, { type: 'UPLOAD_STARTED', draftId: 'draft-0' });
    expect(s2.drafts[0].status).toBe('uploading');
    expect(s2.drafts[0].error).toBeNull();
  });

  it('UPLOAD_SUCCEEDED → extracting + uploadedKey set', () => {
    const s1 = reducer(initBatch(1), { type: 'UPLOAD_STARTED', draftId: 'draft-0' });
    const s2 = reducer(s1, {
      type: 'UPLOAD_SUCCEEDED',
      draftId: 'draft-0',
      uploadedKey: 's3://k',
    });
    expect(s2.drafts[0].status).toBe('extracting');
    expect(s2.drafts[0].uploadedKey).toBe('s3://k');
  });

  it('UPLOAD_FAILED → upload_failed + retryCount incremented', () => {
    const s1 = reducer(initBatch(1), { type: 'UPLOAD_STARTED', draftId: 'draft-0' });
    const s2 = reducer(s1, {
      type: 'UPLOAD_FAILED',
      draftId: 'draft-0',
      error: { code: 'NET', message: 'offline' },
    });
    expect(s2.drafts[0].status).toBe('upload_failed');
    expect(s2.drafts[0].error?.code).toBe('NET');
    expect(s2.drafts[0].retryCount).toBe(1);
  });

  it('EXTRACT_SUCCEEDED with high confidence → ready + none', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_STARTED', draftId: 'draft-0' });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    expect(s.drafts[0].status).toBe('ready');
    expect(s.drafts[0].reviewState).toBe('none');
    expect(s.drafts[0].extracted?.merchant).toBe('Hawker Heaven');
  });

  it('EXTRACT_SUCCEEDED with low confidence → ready + needs_review', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: lowConfidenceExtracted(),
    });
    expect(s.drafts[0].status).toBe('ready');
    expect(s.drafts[0].reviewState).toBe('needs_review');
  });

  it('EXTRACT_FAILED → extract_failed + retryCount incremented', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_FAILED',
      draftId: 'draft-0',
      error: { code: 'AI', message: 'unreadable' },
    });
    expect(s.drafts[0].status).toBe('extract_failed');
    expect(s.drafts[0].retryCount).toBe(1);
  });

  it('SAVE_SUCCEEDED → saved + expenseId', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_STARTED', draftId: 'draft-0' });
    s = reducer(s, { type: 'SAVE_SUCCEEDED', draftId: 'draft-0', expenseId: 'exp-1' });
    expect(s.drafts[0].status).toBe('saved');
    expect(s.drafts[0].expenseId).toBe('exp-1');
  });

  it('SAVE_FAILED → ready + reviewState=failed (per §5.5: stay in tray, not C5)', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_STARTED', draftId: 'draft-0' });
    s = reducer(s, {
      type: 'SAVE_FAILED',
      draftId: 'draft-0',
      error: { code: '500', message: 'server' },
    });
    expect(s.drafts[0].status).toBe('ready');
    expect(s.drafts[0].reviewState).toBe('failed');
    expect(visibleStatusOf(s.drafts[0])).toBe('failed');
  });
});

// ─── APPLY_INLINE_EDIT ───────────────────────────────────────────────────

describe('APPLY_INLINE_EDIT', () => {
  it('patches extracted fields and clears needs_review', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: lowConfidenceExtracted(),
    });
    expect(s.drafts[0].reviewState).toBe('needs_review');
    s = reducer(s, {
      type: 'APPLY_INLINE_EDIT',
      draftId: 'draft-0',
      patch: { merchant: 'Tian Tian' },
    });
    expect(s.drafts[0].extracted?.merchant).toBe('Tian Tian');
    expect(s.drafts[0].reviewState).toBe('none');
  });

  it('does not touch status', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, {
      type: 'APPLY_INLINE_EDIT',
      draftId: 'draft-0',
      patch: { total_cents: 999 },
    });
    expect(s.drafts[0].status).toBe('ready');
  });

  it('is a no-op when extracted is null (no extraction yet)', () => {
    let s: BatchDraft = initBatch(1);
    const before = s.drafts[0];
    s = reducer(s, {
      type: 'APPLY_INLINE_EDIT',
      draftId: 'draft-0',
      patch: { merchant: 'X' },
    });
    expect(s.drafts[0]).toBe(before);
  });

  it('preserves reviewState=failed (only clears needs_review)', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_STARTED', draftId: 'draft-0' });
    s = reducer(s, {
      type: 'SAVE_FAILED',
      draftId: 'draft-0',
      error: { code: '500', message: 'x' },
    });
    expect(s.drafts[0].reviewState).toBe('failed');
    s = reducer(s, {
      type: 'APPLY_INLINE_EDIT',
      draftId: 'draft-0',
      patch: { merchant: 'Updated' },
    });
    expect(s.drafts[0].reviewState).toBe('failed');
  });
});

// ─── Trip assignment ─────────────────────────────────────────────────────

describe('trip assignment', () => {
  it('SET_TRIP_FOR_BATCH updates all unsaved drafts', () => {
    let s: BatchDraft = initBatch(3);
    s = reducer(s, { type: 'SET_TRIP_FOR_BATCH', tripId: 'trip-tokyo' });
    expect(s.drafts.every((d) => d.tripId === 'trip-tokyo')).toBe(true);
  });

  it('SET_TRIP_FOR_BATCH preserves saved drafts', () => {
    let s: BatchDraft = initBatch(2);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_STARTED', draftId: 'draft-0' });
    s = reducer(s, { type: 'SAVE_SUCCEEDED', draftId: 'draft-0', expenseId: 'exp-1' });
    s = reducer(s, { type: 'SET_TRIP_FOR_BATCH', tripId: 'trip-tokyo' });
    expect(s.drafts[0].tripId).toBe('trip-bali'); // saved, not moved
    expect(s.drafts[1].tripId).toBe('trip-tokyo');
  });

  it('SET_TRIP_FOR_DRAFT updates only one draft', () => {
    let s: BatchDraft = initBatch(2);
    s = reducer(s, { type: 'SET_TRIP_FOR_DRAFT', draftId: 'draft-1', tripId: 'trip-kyoto' });
    expect(s.drafts[0].tripId).toBe('trip-bali');
    expect(s.drafts[1].tripId).toBe('trip-kyoto');
  });

  it('SET_TRIP_MODE flips mode without touching trips', () => {
    let s: BatchDraft = initBatch(2);
    s = reducer(s, { type: 'SET_TRIP_MODE', tripMode: 'per_receipt' });
    expect(s.tripMode).toBe('per_receipt');
    expect(s.drafts.every((d) => d.tripId === 'trip-bali')).toBe(true);
  });
});

// ─── Discard ─────────────────────────────────────────────────────────────

describe('discard', () => {
  it('DISCARD_DRAFT moves one draft to discarded', () => {
    let s: BatchDraft = initBatch(2);
    s = reducer(s, { type: 'DISCARD_DRAFT', draftId: 'draft-0' });
    expect(s.drafts[0].status).toBe('discarded');
    expect(s.drafts[1].status).toBe('pending_upload');
  });

  it('DISCARD_ALL discards all unsaved drafts; saved ones survive', () => {
    let s: BatchDraft = initBatch(3);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_SUCCEEDED', draftId: 'draft-0', expenseId: 'exp-1' });
    s = reducer(s, { type: 'DISCARD_ALL' });
    expect(s.drafts[0].status).toBe('saved');
    expect(s.drafts[1].status).toBe('discarded');
    expect(s.drafts[2].status).toBe('discarded');
  });
});

// ─── Flagged review flow ─────────────────────────────────────────────────

describe('flagged review flow', () => {
  function batchWithFlags(): BatchDraft {
    let s: BatchDraft = initBatch(4);
    // Draft 0: ready (clean)
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k0' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    // Draft 1: needs_review
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-1', uploadedKey: 'k1' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-1',
      extracted: lowConfidenceExtracted(),
    });
    // Draft 2: extract_failed
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-2', uploadedKey: 'k2' });
    s = reducer(s, {
      type: 'EXTRACT_FAILED',
      draftId: 'draft-2',
      error: { code: 'AI', message: 'unreadable' },
    });
    // Draft 3: ready (clean)
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-3', uploadedKey: 'k3' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-3',
      extracted: highConfidenceExtracted(),
    });
    return s;
  }

  it('isFlagged true for needs_review and failed', () => {
    const s = batchWithFlags();
    expect(isFlagged(s.drafts[0])).toBe(false);
    expect(isFlagged(s.drafts[1])).toBe(true); // needs_review
    expect(isFlagged(s.drafts[2])).toBe(true); // failed
    expect(isFlagged(s.drafts[3])).toBe(false);
  });

  it('nextFlaggedIndex finds first flagged after fromIndex', () => {
    const s = batchWithFlags();
    expect(nextFlaggedIndex(s, -1)).toBe(1);
    expect(nextFlaggedIndex(s, 1)).toBe(2);
    expect(nextFlaggedIndex(s, 2)).toBe(null);
  });

  it('nextFlaggedIndex skips discarded drafts', () => {
    let s = batchWithFlags();
    s = reducer(s, { type: 'DISCARD_DRAFT', draftId: 'draft-1' });
    expect(nextFlaggedIndex(s, -1)).toBe(2); // 1 discarded → next flagged is 2
  });

  it('ENTER_FLAGGED_REVIEW lands on first flagged', () => {
    let s = batchWithFlags();
    s = reducer(s, { type: 'ENTER_FLAGGED_REVIEW' });
    expect(s.mode).toBe('flagged_review');
    expect(s.cursorIndex).toBe(1);
  });

  it('ENTER_FLAGGED_REVIEW is a no-op when nothing flagged', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    const before = s;
    s = reducer(s, { type: 'ENTER_FLAGGED_REVIEW' });
    expect(s).toBe(before);
  });

  it('EXIT_FLAGGED_REVIEW returns to tray', () => {
    let s = batchWithFlags();
    s = reducer(s, { type: 'ENTER_FLAGGED_REVIEW' });
    s = reducer(s, { type: 'EXIT_FLAGGED_REVIEW' });
    expect(s.mode).toBe('tray');
  });
});

// ─── Counters ────────────────────────────────────────────────────────────

describe('count helpers', () => {
  it('partition counts add up to active drafts', () => {
    let s: BatchDraft = initBatch(4);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-1', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-1',
      extracted: lowConfidenceExtracted(),
    });
    // draft-0: ready, draft-1: needs_review, draft-2: pending_upload, draft-3: pending_upload
    expect(readyDraftCount(s)).toBe(1);
    expect(flaggedDraftCount(s)).toBe(1);
    expect(processingDraftCount(s)).toBe(2);
    expect(savedDraftCount(s)).toBe(0);
  });

  it('hasUnsavedDrafts reflects mixed batch correctly', () => {
    let s: BatchDraft = initBatch(2);
    expect(hasUnsavedDrafts(s)).toBe(true);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'draft-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'draft-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_SUCCEEDED', draftId: 'draft-0', expenseId: 'e' });
    expect(hasUnsavedDrafts(s)).toBe(true); // draft-1 still pending
    s = reducer(s, { type: 'DISCARD_DRAFT', draftId: 'draft-1' });
    expect(hasUnsavedDrafts(s)).toBe(false);
    expect(isBatchTerminal(s)).toBe(true);
  });
});

// ─── Cursor ──────────────────────────────────────────────────────────────

describe('SET_CURSOR', () => {
  it('clamps below zero', () => {
    let s: BatchDraft = initBatch(3);
    s = reducer(s, { type: 'SET_CURSOR', index: -5 });
    expect(s.cursorIndex).toBe(0);
  });

  it('clamps above length-1', () => {
    let s: BatchDraft = initBatch(3);
    s = reducer(s, { type: 'SET_CURSOR', index: 99 });
    expect(s.cursorIndex).toBe(2);
  });
});

// ─── Server id ───────────────────────────────────────────────────────────

describe('BATCH_SERVER_ID_SET', () => {
  it('attaches the server uuid', () => {
    let s: BatchDraft = initBatch(1);
    s = reducer(s, { type: 'BATCH_SERVER_ID_SET', serverId: 'srv-1' });
    expect(s.serverId).toBe('srv-1');
  });
});

// ─── Unknown draftId is a no-op ──────────────────────────────────────────

describe('robustness', () => {
  it('actions targeting unknown draftId are no-ops', () => {
    const s1 = initBatch(2);
    const s2 = reducer(s1, { type: 'UPLOAD_STARTED', draftId: 'does-not-exist' } as Action);
    expect(s2).toBe(s1);
  });
});
