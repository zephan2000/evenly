// Quick capture persistence — debounced writes to a key/value adapter.
//
// Cadence per docs/specs/quick-capture.md §8.3:
//   - Persist after every status transition / inline edit / trip change.
//   - Debounce ~500ms so rapid local changes coalesce into one write.
//   - `flush()` on demand (e.g. app background) bypasses the debounce.
//   - Clear on terminal state (all drafts saved or discarded).
//
// The adapter is the seam: tests inject an in-memory fake; production wires
// `secureStoreAdapter` (expo-secure-store, imported lazily so this module
// stays Node-friendly under vitest).

import type { BatchDraft } from './state';

// ─── Adapter interface ───────────────────────────────────────────────────

export type PersistAdapter = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
};

export const PERSIST_KEY = 'quick_capture_batch_v1';
export const DEFAULT_DEBOUNCE_MS = 500;

// ─── Persister factory ───────────────────────────────────────────────────

export type Persister = {
  /** Schedule a debounced write. Subsequent calls within the debounce window replace the pending value. */
  schedule(batch: BatchDraft): void;
  /** Force-write the latest scheduled or supplied batch immediately. Cancels any pending debounce. */
  flush(batch?: BatchDraft): Promise<void>;
  /** Clear persisted state and cancel any pending writes. */
  clear(): Promise<void>;
  /** Read + parse the persisted batch, or null if nothing stored. */
  restore(): Promise<BatchDraft | null>;
  /** Cancel the pending debounce without writing. Mostly useful in tests. */
  cancel(): void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export function createPersister(
  adapter: PersistAdapter,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): Persister {
  let pendingBatch: BatchDraft | null = null;
  let timer: TimerHandle | null = null;

  const writeNow = async (batch: BatchDraft): Promise<void> => {
    pendingBatch = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    await adapter.write(JSON.stringify(batch));
  };

  return {
    schedule(batch) {
      pendingBatch = batch;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        const b = pendingBatch;
        timer = null;
        if (b !== null) {
          // Fire-and-forget — write errors don't bubble out of a timer.
          // Caller should periodically call `flush()` if it wants to surface
          // errors (e.g., on app background).
          void adapter.write(JSON.stringify(b)).catch(() => undefined);
          pendingBatch = null;
        }
      }, debounceMs);
    },

    async flush(batch) {
      const target = batch ?? pendingBatch;
      if (target === null) return;
      await writeNow(target);
    },

    async clear() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pendingBatch = null;
      await adapter.clear();
    },

    async restore() {
      const raw = await adapter.read();
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as BatchDraft;
      } catch {
        // Corrupt payload — clear it so subsequent runs start fresh.
        await adapter.clear();
        return null;
      }
    },

    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pendingBatch = null;
    },
  };
}

// ─── In-memory adapter (tests + fallback) ────────────────────────────────

export function createMemoryAdapter(): PersistAdapter {
  let value: string | null = null;
  return {
    async read() {
      return value;
    },
    async write(v) {
      value = v;
    },
    async clear() {
      value = null;
    },
  };
}

// ─── Secure-store adapter (production) ───────────────────────────────────

/**
 * Lazy-imports `expo-secure-store` so this module remains importable from
 * Node-side test harnesses without pulling in native modules. The accessor
 * caches the resolved module so repeat calls don't re-resolve.
 */
type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let _secureStoreModule: SecureStoreLike | null = null;
async function getSecureStore(): Promise<SecureStoreLike> {
  if (_secureStoreModule !== null) return _secureStoreModule;
  // Dynamic import — kept off the static graph so vitest in Node doesn't
  // try to resolve the native binding.
  const mod = (await import('expo-secure-store')) as unknown as SecureStoreLike;
  _secureStoreModule = mod;
  return mod;
}

export const secureStoreAdapter: PersistAdapter = {
  async read() {
    const store = await getSecureStore();
    return store.getItemAsync(PERSIST_KEY);
  },
  async write(value) {
    const store = await getSecureStore();
    await store.setItemAsync(PERSIST_KEY, value);
  },
  async clear() {
    const store = await getSecureStore();
    await store.deleteItemAsync(PERSIST_KEY);
  },
};
