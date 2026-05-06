import { describe, expect, it, vi } from 'vitest';

import type { ExtractedExpense } from '@/lib/ai/schema';

import {
  __test_runWithCap,
  CONCURRENCY_CAP,
  type Dispatch,
  type OrchestratorDeps,
  retryExtraction,
  retrySave,
  retryUpload,
  runExtractions,
  runSaves,
  runUploads,
} from '../orchestrator';
import { type BatchDraft, type DraftExpense, reducer } from '../state';

// ─── Fixtures ────────────────────────────────────────────────────────────

function highConfidenceExtracted(): ExtractedExpense {
  return {
    merchant: 'Hawker Heaven',
    expense_date: '2026-05-04',
    currency: 'SGD',
    tax_mode: 'exclusive',
    tax_label: 'GST',
    items: [],
    subtotal_cents: 600,
    service_charge_cents: 60,
    tip_cents: 0,
    tax_amount_cents: 53,
    total_cents: 713,
    category_guess: 'meals',
    confidence: { overall: 0.92, items: 0.9, totals: 0.95 },
    notes: '',
  };
}

function batchWith(imageCount: number): BatchDraft {
  return reducer(
    {
      id: '',
      serverId: null,
      defaultTripId: '',
      tripMode: 'batch',
      createdAt: '',
      drafts: [],
      mode: 'tray',
      cursorIndex: 0,
    },
    {
      type: 'INIT_BATCH',
      batchId: 'b',
      defaultTripId: 'trip-1',
      images: Array.from({ length: imageCount }, (_, i) => ({
        id: `d-${i}`,
        imageUri: `file://${i}.jpg`,
      })),
      createdAt: '2026-05-06T00:00:00.000Z',
    },
  );
}

function fakeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    uploadImage: vi.fn(async (uri: string) => ({ uploadedKey: `key/${uri}` })),
    extractReceipt: vi.fn(async () => ({ extracted: highConfidenceExtracted() })),
    saveExpense: vi.fn(async (d: DraftExpense) => ({ expenseId: `exp-${d.id}` })),
    ...overrides,
  };
}

// Captures dispatched actions against a live state by piping them through
// the reducer. Returns both the running state and a recorded action log.
function recordingDispatch(initial: BatchDraft) {
  let state = initial;
  const log: { type: string; draftId?: string }[] = [];
  const dispatch: Dispatch = (action) => {
    state = reducer(state, action);
    log.push({
      type: action.type,
      draftId: 'draftId' in action ? action.draftId : undefined,
    });
  };
  return {
    get state() {
      return state;
    },
    dispatch,
    log,
  };
}

// ─── runWithCap (concurrency primitive) ──────────────────────────────────

describe('runWithCap', () => {
  it('respects the cap — never more than `cap` tasks in flight at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return 1;
    });
    await __test_runWithCap(tasks, 4);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('returns settled results in input order', async () => {
    const tasks: (() => Promise<number>)[] = [
      async () => 1,
      async () => {
        throw new Error('boom');
      },
      async () => 3,
    ];
    const results = await __test_runWithCap(tasks, 2);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles empty input', async () => {
    const results = await __test_runWithCap([], 4);
    expect(results).toEqual([]);
  });

  it('CONCURRENCY_CAP is exported as 4', () => {
    expect(CONCURRENCY_CAP).toBe(4);
  });
});

// ─── runUploads ──────────────────────────────────────────────────────────

describe('runUploads', () => {
  it('dispatches START + SUCCEEDED for each pending draft', async () => {
    const recorder = recordingDispatch(batchWith(3));
    await runUploads(recorder.state, recorder.dispatch, fakeDeps());
    expect(recorder.state.drafts.every((d) => d.status === 'extracting')).toBe(true);
    expect(recorder.log.filter((e) => e.type === 'UPLOAD_STARTED')).toHaveLength(3);
    expect(recorder.log.filter((e) => e.type === 'UPLOAD_SUCCEEDED')).toHaveLength(3);
  });

  it('isolates failures — one throw does not block siblings', async () => {
    const recorder = recordingDispatch(batchWith(3));
    let count = 0;
    const deps = fakeDeps({
      uploadImage: vi.fn(async () => {
        const i = count;
        count += 1;
        if (i === 1) throw new Error('upload fail');
        return { uploadedKey: `k${i}` };
      }),
    });
    await runUploads(recorder.state, recorder.dispatch, deps);
    const statuses = recorder.state.drafts.map((d) => d.status).sort();
    expect(statuses).toEqual(['extracting', 'extracting', 'upload_failed']);
  });

  it('skips drafts not in pending_upload', async () => {
    let s = batchWith(2);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k' });
    const recorder = recordingDispatch(s);
    const deps = fakeDeps();
    await runUploads(recorder.state, recorder.dispatch, deps);
    expect(deps.uploadImage).toHaveBeenCalledTimes(1);
  });
});

// ─── runExtractions ──────────────────────────────────────────────────────

describe('runExtractions', () => {
  it('only targets drafts in `extracting` with an uploadedKey and no extracted yet', async () => {
    let s = batchWith(3);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k0' });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-1', uploadedKey: 'k1' });
    // d-2 stays pending_upload
    const recorder = recordingDispatch(s);
    const deps = fakeDeps();
    await runExtractions(recorder.state, recorder.dispatch, deps);
    expect(deps.extractReceipt).toHaveBeenCalledTimes(2);
    expect(recorder.state.drafts[0].status).toBe('ready');
    expect(recorder.state.drafts[1].status).toBe('ready');
    expect(recorder.state.drafts[2].status).toBe('pending_upload');
  });

  it('failure isolation works across extractions', async () => {
    let s = batchWith(2);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k0' });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-1', uploadedKey: 'k1' });
    const recorder = recordingDispatch(s);
    let n = 0;
    const deps = fakeDeps({
      extractReceipt: vi.fn(async () => {
        const i = n;
        n += 1;
        if (i === 0) throw new Error('AI down');
        return { extracted: highConfidenceExtracted() };
      }),
    });
    await runExtractions(recorder.state, recorder.dispatch, deps);
    const statuses = recorder.state.drafts.map((d) => d.status);
    expect(statuses).toContain('extract_failed');
    expect(statuses).toContain('ready');
  });
});

// ─── runSaves ────────────────────────────────────────────────────────────

describe('runSaves', () => {
  function setupReadyMixed(): BatchDraft {
    // Two ready (one with reviewState=needs_review), one extract_failed
    let s = batchWith(3);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'd-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-1', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'd-1',
      extracted: {
        ...highConfidenceExtracted(),
        confidence: { overall: 0.4, items: 0.4, totals: 0.4 },
      },
    });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-2', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_FAILED',
      draftId: 'd-2',
      error: { code: 'AI', message: 'x' },
    });
    return s;
  }

  it('only saves drafts with status=ready and reviewState=none', async () => {
    const recorder = recordingDispatch(setupReadyMixed());
    const deps = fakeDeps();
    await runSaves(recorder.state, recorder.dispatch, deps);
    expect(deps.saveExpense).toHaveBeenCalledTimes(1);
    expect(recorder.state.drafts[0].status).toBe('saved');
    expect(recorder.state.drafts[1].status).toBe('ready'); // needs_review left alone
    expect(recorder.state.drafts[2].status).toBe('extract_failed');
  });

  it('SAVE_FAILED leaves siblings saved (per §5.5 partial-failure rule)', async () => {
    let s = batchWith(2);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'd-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-1', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'd-1',
      extracted: highConfidenceExtracted(),
    });
    const recorder = recordingDispatch(s);
    const deps = fakeDeps({
      saveExpense: vi.fn(async (d: DraftExpense) => {
        if (d.id === 'd-0') throw new Error('500');
        return { expenseId: `exp-${d.id}` };
      }),
    });
    await runSaves(recorder.state, recorder.dispatch, deps);
    expect(recorder.state.drafts[0].status).toBe('ready'); // failed save → back to ready
    expect(recorder.state.drafts[0].reviewState).toBe('failed');
    expect(recorder.state.drafts[1].status).toBe('saved');
  });
});

// ─── Single-draft retries ────────────────────────────────────────────────

describe('cause-aware single-draft retries', () => {
  it('retryUpload only runs when status=upload_failed', async () => {
    let s = batchWith(1);
    const deps = fakeDeps();
    // Not failed yet → no-op
    let recorder = recordingDispatch(s);
    await retryUpload(recorder.state.drafts[0], recorder.dispatch, deps);
    expect(deps.uploadImage).not.toHaveBeenCalled();

    s = reducer(s, { type: 'UPLOAD_STARTED', draftId: 'd-0' });
    s = reducer(s, {
      type: 'UPLOAD_FAILED',
      draftId: 'd-0',
      error: { code: 'NET', message: 'x' },
    });
    recorder = recordingDispatch(s);
    await retryUpload(recorder.state.drafts[0], recorder.dispatch, deps);
    expect(deps.uploadImage).toHaveBeenCalledTimes(1);
    expect(recorder.state.drafts[0].status).toBe('extracting');
  });

  it('retryExtraction only runs when status=extract_failed and uploadedKey is set', async () => {
    let s = batchWith(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_FAILED',
      draftId: 'd-0',
      error: { code: 'AI', message: 'x' },
    });
    const recorder = recordingDispatch(s);
    const deps = fakeDeps();
    await retryExtraction(recorder.state.drafts[0], recorder.dispatch, deps);
    expect(deps.extractReceipt).toHaveBeenCalledTimes(1);
    expect(recorder.state.drafts[0].status).toBe('ready');
  });

  it('retrySave only runs when reviewState=failed', async () => {
    let s = batchWith(1);
    s = reducer(s, { type: 'UPLOAD_SUCCEEDED', draftId: 'd-0', uploadedKey: 'k' });
    s = reducer(s, {
      type: 'EXTRACT_SUCCEEDED',
      draftId: 'd-0',
      extracted: highConfidenceExtracted(),
    });
    s = reducer(s, { type: 'SAVE_STARTED', draftId: 'd-0' });
    s = reducer(s, {
      type: 'SAVE_FAILED',
      draftId: 'd-0',
      error: { code: '500', message: 'x' },
    });
    const recorder = recordingDispatch(s);
    const deps = fakeDeps();
    await retrySave(recorder.state.drafts[0], recorder.dispatch, deps);
    expect(deps.saveExpense).toHaveBeenCalledTimes(1);
    expect(recorder.state.drafts[0].status).toBe('saved');
  });
});
