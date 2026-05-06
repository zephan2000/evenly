import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryAdapter,
  createPersister,
  DEFAULT_DEBOUNCE_MS,
  PERSIST_KEY,
  type PersistAdapter,
} from '../persist';
import { type BatchDraft, reducer } from '../state';

function makeBatch(): BatchDraft {
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
      batchId: 'b-1',
      defaultTripId: 'trip-1',
      images: [{ id: 'd-0', imageUri: 'file://0.jpg' }],
      createdAt: '2026-05-06T00:00:00.000Z',
    },
  );
}

function instrumentedAdapter(): {
  adapter: PersistAdapter;
  writes: string[];
  clears: number;
} {
  const inner = createMemoryAdapter();
  const writes: string[] = [];
  let clears = 0;
  return {
    adapter: {
      read: () => inner.read(),
      write: async (v) => {
        writes.push(v);
        await inner.write(v);
      },
      clear: async () => {
        clears += 1;
        await inner.clear();
      },
    },
    writes,
    get clears() {
      return clears;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPersister — debounce', () => {
  it('rapid schedules collapse into a single write', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    const b = makeBatch();
    p.schedule(b);
    p.schedule(b);
    p.schedule(b);

    expect(inst.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(inst.writes).toHaveLength(1);
  });

  it('writes the latest batch — schedule replaces pending value', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    const b1 = makeBatch();
    const b2 = { ...b1, cursorIndex: 5 };

    p.schedule(b1);
    p.schedule(b2);
    await vi.advanceTimersByTimeAsync(100);

    expect(inst.writes).toHaveLength(1);
    const written = JSON.parse(inst.writes[0]) as BatchDraft;
    expect(written.cursorIndex).toBe(5);
  });

  it('flush() bypasses debounce and writes immediately', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 1000);

    const b = makeBatch();
    p.schedule(b);
    expect(inst.writes).toHaveLength(0);
    await p.flush();
    expect(inst.writes).toHaveLength(1);
  });

  it('flush() with explicit batch overrides pending', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 1000);

    const b1 = makeBatch();
    const b2 = { ...b1, cursorIndex: 9 };
    p.schedule(b1);
    await p.flush(b2);
    expect(inst.writes).toHaveLength(1);
    const written = JSON.parse(inst.writes[0]) as BatchDraft;
    expect(written.cursorIndex).toBe(9);
  });

  it('cancel() drops the pending write', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    p.schedule(makeBatch());
    p.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(inst.writes).toHaveLength(0);
  });

  it('clear() cancels pending and wipes storage', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    p.schedule(makeBatch());
    await p.clear();
    expect(inst.clears).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(inst.writes).toHaveLength(0);
  });
});

describe('createPersister — restore', () => {
  it('round-trips a BatchDraft', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    const b = makeBatch();
    await p.flush(b);

    const restored = await p.restore();
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(b.id);
    expect(restored?.drafts).toHaveLength(1);
    expect(restored?.drafts[0].imageUri).toBe('file://0.jpg');
  });

  it('returns null when nothing is stored', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);
    expect(await p.restore()).toBeNull();
  });

  it('clears + returns null when persisted JSON is corrupt', async () => {
    const inst = instrumentedAdapter();
    const p = createPersister(inst.adapter, 100);

    await inst.adapter.write('not-json{');
    expect(await p.restore()).toBeNull();
    expect(inst.clears).toBe(1);
  });
});

describe('createPersister — defaults', () => {
  it('default debounce is 500ms', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(500);
  });

  it('persistence key is versioned', () => {
    expect(PERSIST_KEY).toBe('quick_capture_batch_v1');
  });
});
