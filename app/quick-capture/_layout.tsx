// QC route segment layout.
//
// Wraps the tray (index.tsx) and the full-edit screen ([draftId].tsx)
// in a single QuickCaptureProvider so they share one reducer instance.
// Without this, navigating from the tray to the full-edit screen would
// land in a sibling component tree with its own (empty) state — edits
// in the form would never propagate back to the tray.
//
// This is a nested <Stack> so each screen keeps its own declarative
// header via its <Stack.Screen options> child (titles, back label).
// `headerShown: false` is the default here; index.tsx / [draftId].tsx
// opt in. The previous double-header bug (a root header for this
// nested-navigator route AND this stack's header) is fixed at the
// ROOT layout: app/_layout.tsx's <Stack> now defaults
// headerShown:false, so the root renders no header for this segment
// and only this nested stack's per-screen header shows.

import { Stack } from 'expo-router';
import React from 'react';

import { QuickCaptureProvider } from '@/lib/quick-capture/context';

export default function QuickCaptureLayout() {
  return (
    <QuickCaptureProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </QuickCaptureProvider>
  );
}
