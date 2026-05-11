// Spotlight wizard — pure state-machine helpers.
//
// All non-presentational logic lives here so it can be unit-tested without a
// React renderer. The component layer (lib/ux/spotlight-wizard.tsx +
// components/ui/wizard-step.tsx) imports from this file and adds the
// effects: animation, focus, live-region announcements, container
// measurement.
//
// Locked behavior per docs/specs/spotlight-wizard-primitive.md:
// - Status is `future | active | completed`; consumer owns the values.
// - Auto-advance fires when the active step's status flips to completed
//   AND a renderable future step exists AND per-step autoAdvance isn't
//   set to false.
// - Tap-to-revisit on completed steps; consumer decides what happens to
//   the previously-active step.

export type WizardStepStatus = 'future' | 'active' | 'completed';

export type WizardStepDescriptor = {
  id: string;
  title: string;
  status: WizardStepStatus;
  /** Render-tree slot for the step body when active (or always, in
   *  non-collapse mode). */
  content: React.ReactNode;
  /** Render-tree slot used in collapse mode for non-active steps. */
  summary: React.ReactNode;
  /** Optional trailing affordance in the step header (e.g. an Edit pill
   *  on a completed step). */
  trailing?: React.ReactNode;
  /** When false, the wizard does NOT auto-advance away from this step
   *  even when its status flips to completed. Defaults to true. */
  autoAdvance?: boolean;
  /** When false, tapping this step is a no-op even when it's completed.
   *  Defaults to true. */
  revisitable?: boolean;
};

// ─── Step-state invariants ───────────────────────────────────────────────

export function findStepIndex(steps: readonly WizardStepDescriptor[], id: string): number {
  return steps.findIndex((s) => s.id === id);
}

export function findActiveIndex(steps: readonly WizardStepDescriptor[]): number {
  return steps.findIndex((s) => s.status === 'active');
}

/**
 * Find the next future step after `fromIndex`. Returns the descriptor +
 * absolute index, or null if there's no future step downstream.
 */
export function findNextFutureStep(
  steps: readonly WizardStepDescriptor[],
  fromIndex: number,
): { step: WizardStepDescriptor; index: number } | null {
  for (let i = fromIndex + 1; i < steps.length; i++) {
    if (steps[i].status === 'future') {
      return { step: steps[i], index: i };
    }
  }
  return null;
}

// ─── Auto-advance decision ───────────────────────────────────────────────

export type AutoAdvanceDecision = { advance: true; nextStepId: string } | { advance: false };

/**
 * Decide whether the wizard should auto-advance to the next future step
 * given a transition from `prevSteps` to `nextSteps`. Pure: no side
 * effects, no React.
 *
 * Fires when ALL of the following hold:
 *   1. There IS a current step (active at `currentStepId`).
 *   2. The step at `currentStepId` was 'active' in prevSteps.
 *   3. The step at `currentStepId` is now 'completed' in nextSteps.
 *   4. The step's autoAdvance opt-out is not false.
 *   5. There is at least one downstream step still in 'future' status.
 *
 * Important: this function only considers the active step's
 * active→completed transition. If the consumer skips the active state
 * entirely (e.g. flips a 'future' step straight to 'completed'), no
 * auto-advance fires — that case is treated as intentional out-of-band
 * mutation rather than wizard progression.
 */
export function decideAutoAdvance(
  prevSteps: readonly WizardStepDescriptor[],
  nextSteps: readonly WizardStepDescriptor[],
  currentStepId: string,
): AutoAdvanceDecision {
  const nextIdx = findStepIndex(nextSteps, currentStepId);
  if (nextIdx < 0) return { advance: false };

  const currentNext = nextSteps[nextIdx];
  if (currentNext.status !== 'completed') return { advance: false };
  if (currentNext.autoAdvance === false) return { advance: false };

  const currentPrev = prevSteps.find((s) => s.id === currentStepId);
  if (currentPrev?.status !== 'active') return { advance: false };

  const next = findNextFutureStep(nextSteps, nextIdx);
  if (!next) return { advance: false };

  return { advance: true, nextStepId: next.step.id };
}

// ─── Tap-to-revisit gating ───────────────────────────────────────────────

export type RevisitDecision = { allow: true } | { allow: false; reason: string };

/**
 * Determine whether a tap on `step` is allowed to make it active.
 * Used by the step component's onPress handler. Pure.
 */
export function decideRevisit(
  step: WizardStepDescriptor,
  options: { saving: boolean },
): RevisitDecision {
  if (step.status === 'future') {
    return { allow: false, reason: 'future_step_not_interactive' };
  }
  if (step.status === 'active') {
    return { allow: false, reason: 'already_active' };
  }
  // step.status === 'completed'
  if (options.saving) {
    return { allow: false, reason: 'wizard_saving' };
  }
  if (step.revisitable === false) {
    return { allow: false, reason: 'step_not_revisitable' };
  }
  return { allow: true };
}

// ─── Live-region announcement copy ───────────────────────────────────────

/**
 * Build the screen-reader announcement string fired when a step becomes
 * active. Format kept stable so it's testable: "Step N of M, {title} active."
 * Consumer wires the actual AccessibilityInfo.announceForAccessibility call.
 */
export function buildActiveAnnouncement(
  steps: readonly WizardStepDescriptor[],
  activeStepId: string,
): string | null {
  const idx = findStepIndex(steps, activeStepId);
  if (idx < 0) return null;
  const step = steps[idx];
  if (step.status !== 'active') return null;
  return `Step ${idx + 1} of ${steps.length}, ${step.title} active.`;
}

// ─── Validation ──────────────────────────────────────────────────────────

/**
 * Run the locked invariants from §3 of the primitive spec. Returns null
 * when valid, or a short reason string when not. Useful in dev mode to
 * catch consumer bugs before they reach commit phase.
 */
export function validateSteps(steps: readonly WizardStepDescriptor[]): string | null {
  if (steps.length === 0) return null;
  const ids = new Set<string>();
  let activeCount = 0;
  for (const s of steps) {
    if (ids.has(s.id)) return `duplicate step id: ${s.id}`;
    ids.add(s.id);
    if (s.status === 'active') activeCount += 1;
  }
  if (activeCount > 1) return `multiple active steps (${activeCount})`;
  return null;
}
