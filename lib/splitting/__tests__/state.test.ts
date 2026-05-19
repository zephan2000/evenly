import { describe, expect, it } from 'vitest';

import {
  buildItemAttributions,
  canSave,
  coverage,
  DEFAULT_GROUP_ID,
  panelStepId,
  REVIEW_STEP_ID,
  SHARE_GROUPS_STEP_ID,
  breakdownPerMember,
  memberSubtotals,
  proportionalCharges,
  reducer,
  wizardSteps,
  type Action,
  type InitSplitDraftPayload,
  type SplitDraft,
  type SplittingExpenseItem,
  type SplittingExpenseSummary,
  type SplittingMember,
} from '../state';

// ─── Fixtures ────────────────────────────────────────────────────────────

function members(): SplittingMember[] {
  return [
    { id: 'z', display_name: 'Zephan' },
    { id: 'a', display_name: 'Alika' },
    { id: 'b', display_name: 'Bina' },
    { id: 'c', display_name: 'Carl' },
  ];
}

function items(): SplittingExpenseItem[] {
  return [
    { id: 'i1', name: 'Starters', amount: 2000n, sort_order: 0 },
    { id: 'i2', name: 'Wine', amount: 3000n, sort_order: 1 },
    { id: 'i3', name: 'Steak', amount: 1500n, sort_order: 2 },
    { id: 'i4', name: 'Salad', amount: 700n, sort_order: 3 },
  ];
}

function expense(): SplittingExpenseSummary {
  return {
    id: 'exp-1',
    subtotal: 7200n,
    service_charge: 500n,
    tip: 0n,
    tax_amount: 0n,
    original_amount: 7700n,
    original_currency: 'SGD',
  };
}

function init(payload?: Partial<InitSplitDraftPayload>): SplitDraft {
  return reducer(
    {} as SplitDraft,
    {
      type: 'INIT_SPLIT_DRAFT',
      payload: {
        expense: expense(),
        items: items(),
        members: members(),
        shareSets: [],
        ...payload,
      },
    } as Action,
  );
}

// ─── INIT_SPLIT_DRAFT ────────────────────────────────────────────────────

describe('INIT_SPLIT_DRAFT', () => {
  it('seeds a default "all members" share group with every item', () => {
    const state = init();
    expect(state.shareGroups).toHaveLength(1);
    expect(state.shareGroups[0].id).toBe(DEFAULT_GROUP_ID);
    expect(state.shareGroups[0].memberIds).toEqual(['z', 'a', 'b', 'c']);
    expect(state.shareGroups[0].itemIds).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('jumps straight to Review when the default group covers everything', () => {
    const state = init();
    expect(state.currentStepId).toBe(REVIEW_STEP_ID);
    expect(canSave(state)).toBe(true);
  });

  it('handles an empty trip (no items) by going to Review', () => {
    const state = init({ items: [] });
    expect(state.currentStepId).toBe(REVIEW_STEP_ID);
    expect(canSave(state)).toBe(true);
  });

  it('starts saveStatus idle', () => {
    expect(init().saveStatus).toBe('idle');
  });
});

// ─── ADD_SHARE_GROUP ─────────────────────────────────────────────────────

describe('ADD_SHARE_GROUP', () => {
  it('creates a new group and removes items from the default group', () => {
    const state = reducer(init(), {
      type: 'ADD_SHARE_GROUP',
      groupId: 'g-wine',
      memberIds: ['z', 'a'],
      itemIds: ['i2'],
    });
    expect(state.shareGroups).toHaveLength(2);
    expect(state.shareGroups[0].itemIds).toEqual(['i1', 'i3', 'i4']);
    expect(state.shareGroups[1].id).toBe('g-wine');
    expect(state.shareGroups[1].memberIds).toEqual(['z', 'a']);
    expect(state.shareGroups[1].itemIds).toEqual(['i2']);
  });

  it('attaches a matching share_set id when memberships are equal', () => {
    const state = reducer(
      init({
        shareSets: [{ id: 'ss-za', name: 'Z + A', memberIds: ['a', 'z'], lastUsedAt: null }],
      }),
      {
        type: 'ADD_SHARE_GROUP',
        groupId: 'g-wine',
        memberIds: ['z', 'a'],
        itemIds: ['i2'],
      },
    );
    expect(state.shareGroups[1].shareSetId).toBe('ss-za');
  });

  it('rejects an empty membership (no-op)', () => {
    const before = init();
    const after = reducer(before, {
      type: 'ADD_SHARE_GROUP',
      groupId: 'g-empty',
      memberIds: [],
      itemIds: ['i1'],
    });
    expect(after).toBe(before);
  });

  it('drops the panel when an individual item moves into a new group', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    expect(state.panels).toHaveLength(1);
    state = reducer(state, {
      type: 'ADD_SHARE_GROUP',
      groupId: 'g-extra',
      memberIds: ['z', 'a'],
      itemIds: ['i3'],
    });
    expect(state.panels).toHaveLength(0);
    expect(state.individualItemIds).toEqual([]);
  });
});

// ─── REMOVE_SHARE_GROUP ──────────────────────────────────────────────────

describe('REMOVE_SHARE_GROUP', () => {
  it('moves orphaned items back into the default group', () => {
    let state = reducer(init(), {
      type: 'ADD_SHARE_GROUP',
      groupId: 'g-wine',
      memberIds: ['z', 'a'],
      itemIds: ['i2'],
    });
    state = reducer(state, { type: 'REMOVE_SHARE_GROUP', groupId: 'g-wine' });
    expect(state.shareGroups).toHaveLength(1);
    expect(state.shareGroups[0].id).toBe(DEFAULT_GROUP_ID);
    expect(state.shareGroups[0].itemIds.sort()).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('recreates a default group if the default itself was removed', () => {
    let state = init();
    state = reducer(state, { type: 'REMOVE_SHARE_GROUP', groupId: DEFAULT_GROUP_ID });
    expect(state.shareGroups[0].id).toBe(DEFAULT_GROUP_ID);
    expect(state.shareGroups[0].itemIds).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('is a no-op when the group id does not exist', () => {
    const before = init();
    const after = reducer(before, { type: 'REMOVE_SHARE_GROUP', groupId: 'nope' });
    expect(after).toBe(before);
  });
});

// ─── MOVE_ITEM_TO_GROUP ──────────────────────────────────────────────────

describe('MOVE_ITEM_TO_GROUP', () => {
  it('moves an item into the individual bucket and creates an empty panel', () => {
    const state = reducer(init(), {
      type: 'MOVE_ITEM_TO_GROUP',
      itemId: 'i3',
      groupId: null,
    });
    expect(state.individualItemIds).toContain('i3');
    expect(state.shareGroups[0].itemIds).not.toContain('i3');
    expect(state.panels).toHaveLength(1);
    expect(state.panels[0].itemId).toBe('i3');
    expect(state.panels[0].rule).toBe('equal_among_selected');
    expect(state.panels[0].selections).toEqual([]);
  });

  it('moves an item from individual back into a group and discards the panel', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    state = reducer(state, {
      type: 'MOVE_ITEM_TO_GROUP',
      itemId: 'i3',
      groupId: DEFAULT_GROUP_ID,
    });
    expect(state.individualItemIds).not.toContain('i3');
    expect(state.panels).toHaveLength(0);
    expect(state.shareGroups[0].itemIds).toContain('i3');
  });

  it('is a no-op for a missing item id', () => {
    const before = init();
    const after = reducer(before, { type: 'MOVE_ITEM_TO_GROUP', itemId: 'ghost', groupId: null });
    expect(after).toBe(before);
  });

  it('jumps currentStepId to the new panel when making an item individual', () => {
    // Without this jump the user gets stranded on Share groups: the new
    // panel step is "future" and decideRevisit blocks tapping it.
    const state = reducer(init(), {
      type: 'MOVE_ITEM_TO_GROUP',
      itemId: 'i3',
      groupId: null,
    });
    expect(state.currentStepId).toBe('panel:i3');
  });

  it('falls back to share_groups when returning the active panel item to a group', () => {
    // The panel step disappears from wizardSteps when its item leaves the
    // individual bucket — leaving currentStepId pointing at it would break
    // findStepIndex on the next render.
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    expect(state.currentStepId).toBe('panel:i3');
    state = reducer(state, {
      type: 'MOVE_ITEM_TO_GROUP',
      itemId: 'i3',
      groupId: DEFAULT_GROUP_ID,
    });
    expect(state.currentStepId).toBe('share_groups');
  });
});

// ─── Panel actions ───────────────────────────────────────────────────────

describe('panel actions', () => {
  function withIndividual(itemId = 'i3'): SplitDraft {
    return reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId, groupId: null });
  }

  it('SET_PANEL_MEMBER toggles members in and out', () => {
    let state = withIndividual();
    state = reducer(state, {
      type: 'SET_PANEL_MEMBER',
      itemId: 'i3',
      memberId: 'z',
      included: true,
    });
    state = reducer(state, {
      type: 'SET_PANEL_MEMBER',
      itemId: 'i3',
      memberId: 'a',
      included: true,
    });
    expect(state.panels[0].selections.map((s) => s.memberId)).toEqual(['z', 'a']);

    state = reducer(state, {
      type: 'SET_PANEL_MEMBER',
      itemId: 'i3',
      memberId: 'a',
      included: false,
    });
    expect(state.panels[0].selections.map((s) => s.memberId)).toEqual(['z']);
  });

  it('SET_PANEL_RULE clears amounts when switching to equal split', () => {
    let state = withIndividual();
    state = reducer(state, {
      type: 'SET_PANEL_MEMBER',
      itemId: 'i3',
      memberId: 'z',
      included: true,
    });
    state = reducer(state, { type: 'SET_PANEL_RULE', itemId: 'i3', rule: 'explicit_amount' });
    state = reducer(state, {
      type: 'SET_PANEL_AMOUNT',
      itemId: 'i3',
      memberId: 'z',
      amount: 1500n,
    });
    expect(state.panels[0].selections[0].amount).toBe(1500n);
    state = reducer(state, { type: 'SET_PANEL_RULE', itemId: 'i3', rule: 'equal_among_selected' });
    expect(state.panels[0].selections[0].amount).toBeNull();
  });

  it('SET_PANEL_AMOUNT adds a member if not yet selected', () => {
    const state = reducer(withIndividual(), {
      type: 'SET_PANEL_AMOUNT',
      itemId: 'i3',
      memberId: 'z',
      amount: 1500n,
    });
    expect(state.panels[0].selections).toEqual([{ memberId: 'z', amount: 1500n }]);
  });
});

// ─── Selectors ───────────────────────────────────────────────────────────

describe('coverage / canSave', () => {
  it('default init is fully covered', () => {
    const { covered, remaining } = coverage(init());
    expect(covered).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(remaining).toEqual([]);
    expect(canSave(init())).toBe(true);
  });

  it('an item dropped into individual without a panel is not covered', () => {
    const state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    expect(coverage(state).remaining).toEqual(['i3']);
    expect(canSave(state)).toBe(false);
  });

  it('equal_among_selected with at least one member is complete', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    state = reducer(state, {
      type: 'SET_PANEL_MEMBER',
      itemId: 'i3',
      memberId: 'z',
      included: true,
    });
    expect(canSave(state)).toBe(true);
  });

  it('explicit_amount requires sum to equal item amount', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    state = reducer(state, { type: 'SET_PANEL_RULE', itemId: 'i3', rule: 'explicit_amount' });
    state = reducer(state, {
      type: 'SET_PANEL_AMOUNT',
      itemId: 'i3',
      memberId: 'z',
      amount: 1000n,
    });
    expect(canSave(state)).toBe(false);
    state = reducer(state, {
      type: 'SET_PANEL_AMOUNT',
      itemId: 'i3',
      memberId: 'a',
      amount: 500n,
    });
    expect(canSave(state)).toBe(true);
  });
});

describe('wizardSteps', () => {
  it('emits share_groups + review by default with at most one active', () => {
    const state = init();
    const steps = wizardSteps(state);
    expect(steps.map((s) => s.id)).toEqual([SHARE_GROUPS_STEP_ID, REVIEW_STEP_ID]);
    const active = steps.filter((s) => s.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(REVIEW_STEP_ID);
  });

  it('inserts a per-item step for each individual', () => {
    const state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    const steps = wizardSteps(state);
    expect(steps.map((s) => s.id)).toEqual([
      SHARE_GROUPS_STEP_ID,
      panelStepId('i3'),
      REVIEW_STEP_ID,
    ]);
  });

  it('marks active + completed; a reached step stays revisitable (no soft-lock)', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    // init's default group covers every item → the wizard OPENS on Review,
    // so Review is already reached. MOVE put the cursor on the i3 panel.
    state = reducer(state, { type: 'SET_CURRENT_STEP', stepId: panelStepId('i3') });
    const steps = wizardSteps(state);
    const map = new Map(steps.map((s) => [s.id, s]));
    // Step 1 is domain-complete (i3 individual, rest grouped), not active.
    expect(map.get(SHARE_GROUPS_STEP_ID)!.status).toBe('completed');
    // The i3 panel is active.
    expect(map.get(panelStepId('i3'))!.status).toBe('active');
    // Review was reached (wizard opened there) → stays 'completed'
    // i.e. revisitable. Exempting it here is exactly what soft-locked the
    // user on an earlier step (live-verified 2026-05-20).
    expect(map.get(REVIEW_STEP_ID)!.status).toBe('completed');
  });

  it('keeps exactly one active step at a time', () => {
    let state = init();
    const stepIds = [SHARE_GROUPS_STEP_ID, REVIEW_STEP_ID];
    for (const id of stepIds) {
      state = reducer(state, { type: 'SET_CURRENT_STEP', stepId: id });
      const active = wizardSteps(state).filter((s) => s.status === 'active');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(id);
    }
  });

  it('Review stays revisitable once reached, then completed after save', () => {
    // init opens on Review (default group covers all items) → Review is
    // reached. Navigating up to Share groups must NOT strand the user:
    // Review stays 'completed' (revisitable), never reverts to 'future'.
    // This is the soft-lock regression guard.
    let state = reducer(init(), { type: 'SET_CURRENT_STEP', stepId: SHARE_GROUPS_STEP_ID });
    expect(wizardSteps(state).find((s) => s.id === REVIEW_STEP_ID)!.status).toBe('completed');
    state = reducer(state, { type: 'SAVE_SUCCEEDED' });
    expect(wizardSteps(state).find((s) => s.id === REVIEW_STEP_ID)!.status).toBe('completed');
  });
});

describe('buildItemAttributions / subtotals / proportionalCharges', () => {
  it('builds equal-split shares for the default group', () => {
    const attrs = buildItemAttributions(init());
    expect(attrs).toHaveLength(4);
    // Starters 2000¢ / 4 members = 500¢ each
    const starters = attrs.find((a) => a.itemId === 'i1')!;
    expect(starters.shares.get('z')).toBe(500n);
    expect(starters.shares.get('a')).toBe(500n);
    expect(starters.shares.get('b')).toBe(500n);
    expect(starters.shares.get('c')).toBe(500n);
  });

  it('memberSubtotals sums every member across all items', () => {
    const subs = memberSubtotals(init());
    // 4 items totaling 7200, evenly split → 1800 each
    expect(subs.get('z')).toBe(1800n);
    expect(subs.get('a')).toBe(1800n);
    expect(subs.get('b')).toBe(1800n);
    expect(subs.get('c')).toBe(1800n);
  });

  it('proportionalCharges distributes the expense service charge proportionally', () => {
    // Service charge 500¢ across equal subtotals → 125¢ each.
    const out = proportionalCharges(init());
    for (const m of ['z', 'a', 'b', 'c']) expect(out.get(m)).toBe(125n);
  });

  it('grand-total of breakdownPerMember equals subtotal + service + tip + tax', () => {
    const out = breakdownPerMember(init());
    let total = 0n;
    for (const b of out.values()) total += b.total;
    const exp = expense();
    expect(total).toBe(exp.subtotal + exp.service_charge + exp.tip + exp.tax_amount);
  });

  it('omits individual items with incomplete panels from attributions', () => {
    let state = reducer(init(), { type: 'MOVE_ITEM_TO_GROUP', itemId: 'i3', groupId: null });
    state = reducer(state, { type: 'SET_PANEL_RULE', itemId: 'i3', rule: 'explicit_amount' });
    // No amounts set yet — panel incomplete.
    const attrs = buildItemAttributions(state);
    expect(attrs.find((a) => a.itemId === 'i3')).toBeUndefined();
  });
});

// ─── Save lifecycle ──────────────────────────────────────────────────────

describe('save lifecycle', () => {
  it('SAVE_STARTED → SAVE_SUCCEEDED ends at saved with no error', () => {
    let state = reducer(init(), { type: 'SAVE_STARTED' });
    expect(state.saveStatus).toBe('saving');
    state = reducer(state, { type: 'SAVE_SUCCEEDED' });
    expect(state.saveStatus).toBe('saved');
    expect(state.saveError).toBeNull();
  });

  it('SAVE_FAILED stores the error and flips to error status', () => {
    const state = reducer(init(), {
      type: 'SAVE_FAILED',
      error: { code: 'network', message: 'offline' },
    });
    expect(state.saveStatus).toBe('error');
    expect(state.saveError).toEqual({ code: 'network', message: 'offline' });
  });
});
