// QuickCaptureProvider — shares the batch reducer state + dispatch across
// the QC route group so the tray screen and the full-edit screen can read
// and mutate the same draft list.
//
// Both routes (app/(tabs)/quick-capture/index.tsx and
// app/(tabs)/quick-capture/[draftId].tsx) sit under the same Expo Router
// layout but mount as separate component trees. Without a shared context,
// the [draftId] screen has no way to read the in-progress drafts or to
// dispatch APPLY_INLINE_EDIT actions back to the tray's reducer.
//
// The provider is intentionally minimal — it only owns the reducer.
// Trip-fetch state, orchestrator deps, ephemeral picker UI flags, etc.
// stay local to whichever screen needs them; the [draftId] screen only
// needs read/write access to the draft itself.

import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

import { type Action, type BatchDraft, reducer } from './state';

type ContextValue = {
  state: BatchDraft;
  dispatch: (action: Action) => void;
};

const QuickCaptureContext = createContext<ContextValue | null>(null);

function makeEmptyBatch(): BatchDraft {
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

export function QuickCaptureProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, makeEmptyBatch);
  return (
    <QuickCaptureContext.Provider value={{ state, dispatch }}>
      {children}
    </QuickCaptureContext.Provider>
  );
}

/** Read the current batch state. Throws if used outside the provider. */
export function useQuickCaptureState(): BatchDraft {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) {
    throw new Error('useQuickCaptureState must be used within QuickCaptureProvider');
  }
  return ctx.state;
}

/** Dispatch a reducer action. Throws if used outside the provider. */
export function useQuickCaptureDispatch(): (action: Action) => void {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) {
    throw new Error('useQuickCaptureDispatch must be used within QuickCaptureProvider');
  }
  return ctx.dispatch;
}
