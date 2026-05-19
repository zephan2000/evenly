// QC route segment layout — provider only, NOT a navigator.
//
// Wraps the tray (index.tsx) and the full-edit screen ([draftId].tsx)
// in a single QuickCaptureProvider so they share one reducer instance.
// Without this, navigating from the tray to the full-edit screen would
// land in a sibling component tree with its own (empty) state — edits
// in the form would never propagate back to the tray.
//
// This uses <Slot/>, NOT <Stack/>. A nested <Stack> here added a second
// navigator level: the root Stack rendered its own header for the
// "quick-capture" nested-navigator route ("quick-capture") AND this
// nested Stack rendered the screen header ("Quick capture") → a double
// header bar. With <Slot/> the segment is a passthrough: quick-capture/
// index and [draftId] are ordinary root-Stack screens (exactly like
// app/expenses/*), each owning its single header via its own
// <Stack.Screen options> child. The provider stays mounted across
// index↔[draftId] (same segment), so the shared reducer is preserved.

import { Slot } from 'expo-router';
import React from 'react';

import { QuickCaptureProvider } from '@/lib/quick-capture/context';

export default function QuickCaptureLayout() {
  return (
    <QuickCaptureProvider>
      <Slot />
    </QuickCaptureProvider>
  );
}
