import { describe, expect, it } from 'vitest';

import {
  buildActiveAnnouncement,
  decideAutoAdvance,
  decideRevisit,
  findActiveIndex,
  findNextFutureStep,
  findStepIndex,
  validateSteps,
  type WizardStepDescriptor,
  type WizardStepStatus,
} from '../spotlight-wizard-logic';

// ─── Test fixtures ───────────────────────────────────────────────────────

function makeStep(
  id: string,
  status: WizardStepStatus,
  extras: Partial<WizardStepDescriptor> = {},
): WizardStepDescriptor {
  return {
    id,
    title: `Step ${id}`,
    status,
    content: null,
    summary: null,
    ...extras,
  };
}

// ─── findStepIndex / findActiveIndex ─────────────────────────────────────

describe('findStepIndex', () => {
  it('returns -1 when no match', () => {
    expect(findStepIndex([makeStep('a', 'active')], 'b')).toBe(-1);
  });

  it('returns the index when found', () => {
    expect(findStepIndex([makeStep('a', 'completed'), makeStep('b', 'active')], 'b')).toBe(1);
  });
});

describe('findActiveIndex', () => {
  it('returns -1 when no step is active (terminal all-completed state)', () => {
    expect(findActiveIndex([makeStep('a', 'completed'), makeStep('b', 'completed')])).toBe(-1);
  });

  it('returns the index of the single active step', () => {
    expect(findActiveIndex([makeStep('a', 'completed'), makeStep('b', 'active')])).toBe(1);
  });
});

// ─── findNextFutureStep ──────────────────────────────────────────────────

describe('findNextFutureStep', () => {
  it('returns null when no downstream future step exists', () => {
    const steps = [makeStep('a', 'completed'), makeStep('b', 'active'), makeStep('c', 'completed')];
    expect(findNextFutureStep(steps, 1)).toBeNull();
  });

  it('skips non-future steps and returns the next future one', () => {
    const steps = [
      makeStep('a', 'active'),
      makeStep('b', 'completed'),
      makeStep('c', 'completed'),
      makeStep('d', 'future'),
      makeStep('e', 'future'),
    ];
    const result = findNextFutureStep(steps, 0);
    expect(result?.step.id).toBe('d');
    expect(result?.index).toBe(3);
  });

  it('returns null when fromIndex is at the end', () => {
    const steps = [makeStep('a', 'active'), makeStep('b', 'future')];
    expect(findNextFutureStep(steps, 1)).toBeNull();
  });
});

// ─── decideAutoAdvance ───────────────────────────────────────────────────

describe('decideAutoAdvance', () => {
  it('fires when active step transitions to completed with a future step downstream', () => {
    const prev = [makeStep('a', 'active'), makeStep('b', 'future'), makeStep('c', 'future')];
    const next = [makeStep('a', 'completed'), makeStep('b', 'future'), makeStep('c', 'future')];
    const decision = decideAutoAdvance(prev, next, 'a');
    expect(decision).toEqual({ advance: true, nextStepId: 'b' });
  });

  it('skips intermediate non-future steps when picking the next', () => {
    const prev = [makeStep('a', 'active'), makeStep('b', 'completed'), makeStep('c', 'future')];
    const next = [makeStep('a', 'completed'), makeStep('b', 'completed'), makeStep('c', 'future')];
    const decision = decideAutoAdvance(prev, next, 'a');
    expect(decision).toEqual({ advance: true, nextStepId: 'c' });
  });

  it('does NOT fire when no downstream future step exists (terminal state)', () => {
    const prev = [makeStep('a', 'active'), makeStep('b', 'completed')];
    const next = [makeStep('a', 'completed'), makeStep('b', 'completed')];
    expect(decideAutoAdvance(prev, next, 'a')).toEqual({ advance: false });
  });

  it('does NOT fire when the step was not active in prevSteps (out-of-band mutation)', () => {
    const prev = [makeStep('a', 'future'), makeStep('b', 'future')];
    const next = [makeStep('a', 'completed'), makeStep('b', 'future')];
    expect(decideAutoAdvance(prev, next, 'a')).toEqual({ advance: false });
  });

  it('does NOT fire when the step is not yet completed in nextSteps', () => {
    const prev = [makeStep('a', 'active'), makeStep('b', 'future')];
    const next = [makeStep('a', 'active'), makeStep('b', 'future')];
    expect(decideAutoAdvance(prev, next, 'a')).toEqual({ advance: false });
  });

  it('does NOT fire when the active step has autoAdvance:false', () => {
    const prev = [makeStep('a', 'active', { autoAdvance: false }), makeStep('b', 'future')];
    const next = [makeStep('a', 'completed', { autoAdvance: false }), makeStep('b', 'future')];
    expect(decideAutoAdvance(prev, next, 'a')).toEqual({ advance: false });
  });

  it('does NOT fire when the active step id is missing from nextSteps', () => {
    const prev = [makeStep('a', 'active'), makeStep('b', 'future')];
    const next = [makeStep('b', 'future')];
    expect(decideAutoAdvance(prev, next, 'a')).toEqual({ advance: false });
  });
});

// ─── decideRevisit ───────────────────────────────────────────────────────

describe('decideRevisit', () => {
  it('rejects future steps', () => {
    const result = decideRevisit(makeStep('a', 'future'), { saving: false });
    expect(result).toEqual({ allow: false, reason: 'future_step_not_interactive' });
  });

  it('rejects taps on the currently-active step', () => {
    const result = decideRevisit(makeStep('a', 'active'), { saving: false });
    expect(result).toEqual({ allow: false, reason: 'already_active' });
  });

  it('rejects when saving is true', () => {
    const result = decideRevisit(makeStep('a', 'completed'), { saving: true });
    expect(result).toEqual({ allow: false, reason: 'wizard_saving' });
  });

  it('rejects when the step has revisitable:false', () => {
    const result = decideRevisit(makeStep('a', 'completed', { revisitable: false }), {
      saving: false,
    });
    expect(result).toEqual({ allow: false, reason: 'step_not_revisitable' });
  });

  it('allows revisit on a completed, revisitable step when not saving', () => {
    const result = decideRevisit(makeStep('a', 'completed'), { saving: false });
    expect(result).toEqual({ allow: true });
  });
});

// ─── buildActiveAnnouncement ─────────────────────────────────────────────

describe('buildActiveAnnouncement', () => {
  it('formats the canonical announcement string', () => {
    const steps = [
      makeStep('a', 'completed'),
      makeStep('b', 'active', { title: 'Share groups' }),
      makeStep('c', 'future'),
    ];
    expect(buildActiveAnnouncement(steps, 'b')).toBe('Step 2 of 3, Share groups active.');
  });

  it('returns null when the step is not currently active', () => {
    const steps = [makeStep('a', 'completed'), makeStep('b', 'future')];
    expect(buildActiveAnnouncement(steps, 'a')).toBeNull();
    expect(buildActiveAnnouncement(steps, 'b')).toBeNull();
  });

  it('returns null when the step id is unknown', () => {
    expect(buildActiveAnnouncement([makeStep('a', 'active')], 'z')).toBeNull();
  });
});

// ─── validateSteps ───────────────────────────────────────────────────────

describe('validateSteps', () => {
  it('accepts an empty step list', () => {
    expect(validateSteps([])).toBeNull();
  });

  it('accepts a well-formed list', () => {
    expect(
      validateSteps([makeStep('a', 'completed'), makeStep('b', 'active'), makeStep('c', 'future')]),
    ).toBeNull();
  });

  it('rejects duplicate ids', () => {
    expect(validateSteps([makeStep('a', 'active'), makeStep('a', 'future')])).toMatch(
      /duplicate step id/,
    );
  });

  it('rejects multiple active steps', () => {
    expect(
      validateSteps([makeStep('a', 'active'), makeStep('b', 'active'), makeStep('c', 'future')]),
    ).toMatch(/multiple active steps/);
  });

  it('accepts the terminal all-completed state', () => {
    expect(validateSteps([makeStep('a', 'completed'), makeStep('b', 'completed')])).toBeNull();
  });
});
