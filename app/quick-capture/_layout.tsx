// QC route group layout.
//
// Wraps the tray (index.tsx) and the full-edit screen ([draftId].tsx)
// in a single QuickCaptureProvider so they share one reducer instance.
// Without this, navigating from the tray to the full-edit screen would
// land in a sibling component tree with its own (empty) state — edits
// in the form would never propagate back to the tray.

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
