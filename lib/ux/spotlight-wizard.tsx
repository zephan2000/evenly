// Spotlight wizard — controlled composer.
//
// Renders N stacked WizardStep blocks. Owns the cross-cutting effects:
//   - Auto-advance on the active step's active→completed transition
//   - Focus management when the active step changes
//   - Screen-reader live-region announcements
//   - Container-width measurement for the mobile-collapse breakpoint
//   - Reduced-motion handling
//
// Consumer responsibilities:
//   - Compute and pass `WizardStepDescriptor[]` with current status values
//   - Update `currentStepId` via the controlled `onStepChange` callback
//
// Visual treatment lives in components/ui/wizard-step.tsx and is intentionally
// working-register. Codex's editorial pass will refine the accent border,
// shadow tokens, scale curve, density.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';

import { WizardStep } from '@/components/ui/wizard-step';
import { Space } from '@/constants/theme';

import {
  buildActiveAnnouncement,
  decideAutoAdvance,
  decideRevisit,
  validateSteps,
  type WizardStepDescriptor,
} from './spotlight-wizard-logic';

export type SpotlightWizardProps = {
  steps: WizardStepDescriptor[];
  currentStepId: string;
  onStepChange: (stepId: string) => void;

  /** When true, tap-to-revisit is suppressed and announcement is muted. */
  saving?: boolean;
  /** Overrides the default ARIA label on the wizard root. */
  ariaLabel?: string;
  /** Fires after the wizard moves to the next future step via auto-advance.
   *  Useful for analytics or validation side-effects; not required. */
  onAdvance?: (nextStepId: string) => void;
  /** Container-width threshold for collapse mode. Default 600. */
  collapseBreakpoint?: number;
  /** When true, force collapse mode regardless of measured width. Useful for
   *  tests and for consumers that want unconditional collapse. */
  forceCollapsed?: boolean;
};

export function SpotlightWizard({
  steps,
  currentStepId,
  onStepChange,
  saving = false,
  ariaLabel = 'Step wizard',
  onAdvance,
  collapseBreakpoint = 600,
  forceCollapsed = false,
}: SpotlightWizardProps) {
  // Validate invariants in dev. Doesn't throw — surfacing via console is
  // enough; tests in spotlight-wizard-logic.test cover the actual rules.
  if (process.env.NODE_ENV !== 'production') {
    const reason = validateSteps(steps);
    if (reason) {
       
      console.warn(`[SpotlightWizard] step list invariant violated: ${reason}`);
    }
  }

  // ─── Container measurement → collapse mode ─────────────────────────────
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const collapsed =
    forceCollapsed || (containerWidth !== null && containerWidth < collapseBreakpoint);

  // ─── Auto-advance on status transition ─────────────────────────────────
  const prevStepsRef = useRef<WizardStepDescriptor[]>(steps);
  useEffect(() => {
    const decision = decideAutoAdvance(prevStepsRef.current, steps, currentStepId);
    prevStepsRef.current = steps;
    if (decision.advance) {
      onStepChange(decision.nextStepId);
      onAdvance?.(decision.nextStepId);
    }
    // Intentionally only re-runs when `steps` changes. currentStepId is read
    // imperatively from the latest closure; onStepChange/onAdvance are
    // assumed stable enough for this effect (consumers wrap in useCallback
    // or accept the occasional duplicate trigger — the guard prevents
    // duplicate dispatches because the next render's decideAutoAdvance
    // sees the already-active next step as still-active, not just-completed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  // ─── Step refs for focus management ────────────────────────────────────
  const stepRefs = useRef<Record<string, View | null>>({});
  const setStepRef = (id: string) => (node: View | null) => {
    stepRefs.current[id] = node;
  };

  // ─── Focus + live-region announcement when active step changes ─────────
  useEffect(() => {
    const activeStep = steps.find((s) => s.id === currentStepId);
    if (!activeStep || activeStep.status !== 'active') return;

    // Announce. Skipped while saving — the announcement during a mid-save
    // re-render is noise.
    if (!saving) {
      const announcement = buildActiveAnnouncement(steps, currentStepId);
      if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
    }

    // Move focus. On web, this calls .focus() on the underlying DOM node.
    // On native, AccessibilityInfo.setAccessibilityFocus moves the
    // accessibility focus ring (the visual focus is owned by the OS).
    const node = stepRefs.current[currentStepId];
    if (!node) return;

    if (typeof window !== 'undefined') {
      // Web: native DOM focus.
      const domNode = node as unknown as { focus?: () => void };
      if (typeof domNode.focus === 'function') {
        // Defer one tick so the layout has settled.
        const timer = setTimeout(() => domNode.focus?.(), 0);
        return () => clearTimeout(timer);
      }
    } else {
      // Native: reactTag-based accessibility focus.
      const tag = findNodeHandle(node);
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    }
  }, [currentStepId, steps, saving]);

  // ─── Memo'd activation handlers per step ───────────────────────────────
  const handlers = useMemo(() => {
    const out: Record<string, () => void> = {};
    for (const s of steps) {
      out[s.id] = () => {
        const decision = decideRevisit(s, { saving });
        if (decision.allow) onStepChange(s.id);
      };
    }
    return out;
  }, [steps, saving, onStepChange]);

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (containerWidth !== next) setContainerWidth(next);
      }}
      accessibilityLabel={ariaLabel}
      {...({ role: 'region', 'aria-label': ariaLabel } as Record<string, unknown>)}
    >
      {steps.map((step, idx) => (
        <WizardStep
          key={step.id}
          ref={setStepRef(step.id)}
          id={step.id}
          title={step.title}
          status={step.status}
          collapsed={collapsed}
          content={step.content}
          summary={step.summary}
          trailing={step.trailing}
          onActivate={handlers[step.id]}
          index={idx}
          total={steps.length}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space[12],
  },
});
