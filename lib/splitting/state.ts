// Splitting reducer + selectors. Pure logic — no React imports.
//
// State model per docs/specs/m2-splitting.md §8.1. The reducer owns:
//   - which items belong to which share group (or are individual)
//   - per-item panel state (rule, selections)
//   - currentStepId (wizard cursor)
//   - save lifecycle (idle/saving/error)
//
// The screen layer (app/(tabs)/expenses/[id]/split.tsx) maps the reducer's
// wizard-step skeletons onto the WizardStepDescriptor[] shape that the
// spotlight-wizard primitive consumes.
//
// Invariants:
//   - Every item belongs to exactly one of: a share group, or the
//     individual bucket. Never both. Never neither.
//   - The "default" share group is created at INIT with every trip member
//     and every item. Items may leave it via ADD_SHARE_GROUP /
//     MOVE_ITEM_TO_GROUP / MAKE_INDIVIDUAL. It may be emptied but it is
//     not auto-removed.
//   - A per-person panel exists iff its item is in the individual bucket.

import {
  distributeProportional,
  equalSplit,
  memberSubtotals as memberSubtotalsFromItems,
  type Charges,
  type ItemAttribution,
  type MemberBreakdown,
} from './distribute';
import { membershipKey, type ShareSetSuggestion } from './share-sets';

// ─── Input shapes ────────────────────────────────────────────────────────

export type SplittingExpenseItem = {
  id: string;
  name: string;
  amount: bigint;
  sort_order: number;
};

export type SplittingMember = {
  id: string;
  display_name: string;
};

export type SplittingExpenseSummary = {
  id: string;
  subtotal: bigint;
  service_charge: bigint;
  tip: bigint;
  tax_amount: bigint;
  original_amount: bigint;
  original_currency: string;
};

// ─── Draft shapes ────────────────────────────────────────────────────────

export type ShareRule = 'equal_among_selected' | 'explicit_amount';

export type ShareGroupDraft = {
  /** Local id (UUID generated client-side). Stable across the wizard's
   *  lifetime. The "default" group always has id === DEFAULT_GROUP_ID. */
  id: string;
  /** When this group matches an existing share_set by membership, this is
   *  the server-side id. Null means "auto-create on save". */
  shareSetId: string | null;
  memberIds: string[];
  itemIds: string[];
  /** User-facing label. Auto-named at creation, user-renameable. */
  name: string;
};

export type PerPersonPanelDraft = {
  itemId: string;
  rule: ShareRule;
  selections: { memberId: string; amount: bigint | null }[];
};

export type SplitSaveError = { code: string; message: string };

export type SaveStatus = 'idle' | 'saving' | 'error' | 'saved';

export type SplitDraft = {
  expenseId: string;
  expense: SplittingExpenseSummary;
  expenseItems: SplittingExpenseItem[];
  members: SplittingMember[]; // stable order — used as memberOrder for distribution
  shareSets: ShareSetSuggestion[]; // suggestions for Step 1
  shareGroups: ShareGroupDraft[];
  /** Items pulled out of share groups via "Make individual". A panel
   *  exists for each id here. */
  individualItemIds: string[];
  panels: PerPersonPanelDraft[];
  currentStepId: string;
  saveStatus: SaveStatus;
  saveError: SplitSaveError | null;
};

export const DEFAULT_GROUP_ID = 'default';
export const SHARE_GROUPS_STEP_ID = 'share_groups';
export const REVIEW_STEP_ID = 'review';

export function panelStepId(itemId: string): string {
  return `panel:${itemId}`;
}

// ─── Action union ────────────────────────────────────────────────────────

export type InitSplitDraftPayload = {
  expense: SplittingExpenseSummary;
  items: SplittingExpenseItem[];
  members: SplittingMember[];
  shareSets: ShareSetSuggestion[];
};

export type Action =
  | { type: 'INIT_SPLIT_DRAFT'; payload: InitSplitDraftPayload }
  | {
      type: 'ADD_SHARE_GROUP';
      groupId: string;
      memberIds: string[];
      itemIds: string[];
      name?: string;
    }
  | { type: 'REMOVE_SHARE_GROUP'; groupId: string }
  | { type: 'RENAME_SHARE_GROUP'; groupId: string; name: string }
  | { type: 'SET_SHARE_GROUP_MEMBERS'; groupId: string; memberIds: string[] }
  | { type: 'MOVE_ITEM_TO_GROUP'; itemId: string; groupId: string | null }
  | { type: 'SET_PANEL_RULE'; itemId: string; rule: ShareRule }
  | { type: 'SET_PANEL_MEMBER'; itemId: string; memberId: string; included: boolean }
  | { type: 'SET_PANEL_AMOUNT'; itemId: string; memberId: string; amount: bigint }
  | { type: 'SET_CURRENT_STEP'; stepId: string }
  | { type: 'SAVE_STARTED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'SAVE_FAILED'; error: SplitSaveError };

// ─── Reducer ─────────────────────────────────────────────────────────────

export function reducer(state: SplitDraft, action: Action): SplitDraft {
  switch (action.type) {
    case 'INIT_SPLIT_DRAFT': {
      const { expense, items, members, shareSets } = action.payload;
      const defaultGroup: ShareGroupDraft = {
        id: DEFAULT_GROUP_ID,
        shareSetId: null,
        memberIds: members.map((m) => m.id),
        itemIds: items.map((i) => i.id),
        name: 'All members',
      };
      return {
        expenseId: expense.id,
        expense,
        expenseItems: items.slice(),
        members: members.slice(),
        shareSets: shareSets.slice(),
        shareGroups: [defaultGroup],
        individualItemIds: [],
        panels: [],
        currentStepId: initialStepId(items, defaultGroup),
        saveStatus: 'idle',
        saveError: null,
      };
    }

    case 'ADD_SHARE_GROUP': {
      if (action.memberIds.length === 0) return state; // no-op
      const itemIds = action.itemIds.slice();
      // Remove these items from any group/individual bucket they're in.
      const groupsAfterMove = state.shareGroups.map((g) => ({
        ...g,
        itemIds: g.itemIds.filter((id) => !itemIds.includes(id)),
      }));
      const newGroup: ShareGroupDraft = {
        id: action.groupId,
        shareSetId: matchShareSetId(action.memberIds, state.shareSets),
        memberIds: action.memberIds.slice(),
        itemIds,
        name: action.name ?? defaultGroupName(action.memberIds, state.members),
      };
      // Drop any panels for items that just left individual.
      const panels = state.panels.filter((p) => !itemIds.includes(p.itemId));
      const individualItemIds = state.individualItemIds.filter((id) => !itemIds.includes(id));
      return {
        ...state,
        shareGroups: [...groupsAfterMove, newGroup],
        individualItemIds,
        panels,
      };
    }

    case 'REMOVE_SHARE_GROUP': {
      const target = state.shareGroups.find((g) => g.id === action.groupId);
      if (!target) return state;
      const remaining = state.shareGroups.filter((g) => g.id !== action.groupId);
      // Fall the orphaned items back into the default group (creating it
      // if the user removed the default).
      const defaultIdx = remaining.findIndex((g) => g.id === DEFAULT_GROUP_ID);
      if (defaultIdx >= 0) {
        const defaults = remaining[defaultIdx];
        remaining[defaultIdx] = {
          ...defaults,
          itemIds: dedupe([...defaults.itemIds, ...target.itemIds]),
        };
        return { ...state, shareGroups: remaining };
      }
      const recreatedDefault: ShareGroupDraft = {
        id: DEFAULT_GROUP_ID,
        shareSetId: null,
        memberIds: state.members.map((m) => m.id),
        itemIds: target.itemIds.slice(),
        name: 'All members',
      };
      return { ...state, shareGroups: [recreatedDefault, ...remaining] };
    }

    case 'RENAME_SHARE_GROUP': {
      const idx = state.shareGroups.findIndex((g) => g.id === action.groupId);
      if (idx < 0) return state;
      const groups = state.shareGroups.slice();
      groups[idx] = { ...groups[idx], name: action.name };
      return { ...state, shareGroups: groups };
    }

    case 'SET_SHARE_GROUP_MEMBERS': {
      const idx = state.shareGroups.findIndex((g) => g.id === action.groupId);
      if (idx < 0) return state;
      if (action.memberIds.length === 0) return state;
      const groups = state.shareGroups.slice();
      groups[idx] = {
        ...groups[idx],
        memberIds: action.memberIds.slice(),
        shareSetId: matchShareSetId(action.memberIds, state.shareSets),
      };
      return { ...state, shareGroups: groups };
    }

    case 'MOVE_ITEM_TO_GROUP': {
      const { itemId, groupId } = action;
      const item = state.expenseItems.find((i) => i.id === itemId);
      if (!item) return state;

      // Remove from every group and from individual bucket first.
      const cleanedGroups = state.shareGroups.map((g) => ({
        ...g,
        itemIds: g.itemIds.filter((id) => id !== itemId),
      }));
      const cleanedIndividual = state.individualItemIds.filter((id) => id !== itemId);
      const cleanedPanels = state.panels.filter((p) => p.itemId !== itemId);

      if (groupId === null) {
        // Make individual: create a panel + jump the wizard cursor to its
        // panel step. Without the cursor-jump the user gets stranded on
        // step 1: the new panel step renders as "future", and `decideRevisit`
        // forbids tapping a future step. Auto-jump here gives the obvious
        // "now pick who's on this item" follow-through.
        const panel = makeDefaultPanel(item);
        return {
          ...state,
          shareGroups: cleanedGroups,
          individualItemIds: [...cleanedIndividual, itemId],
          panels: [...cleanedPanels, panel],
          currentStepId: panelStepId(itemId),
        };
      }

      const idx = cleanedGroups.findIndex((g) => g.id === groupId);
      if (idx < 0) return state;
      cleanedGroups[idx] = {
        ...cleanedGroups[idx],
        itemIds: [...cleanedGroups[idx].itemIds, itemId],
      };
      // If returning the active panel's item to a group, the panel's step
      // is about to disappear from wizardSteps — drop back to Share groups
      // so the user isn't pointing at a dead step id.
      const nextStepId =
        state.currentStepId === panelStepId(itemId) ? SHARE_GROUPS_STEP_ID : state.currentStepId;
      return {
        ...state,
        shareGroups: cleanedGroups,
        individualItemIds: cleanedIndividual,
        panels: cleanedPanels,
        currentStepId: nextStepId,
      };
    }

    case 'SET_PANEL_RULE': {
      const idx = state.panels.findIndex((p) => p.itemId === action.itemId);
      if (idx < 0) return state;
      const panels = state.panels.slice();
      const prev = panels[idx];
      panels[idx] = {
        ...prev,
        rule: action.rule,
        selections: prev.selections.map((s) => ({
          ...s,
          // Switching to equal mode resets numeric overrides to null. The
          // selection set itself (who's included) is preserved.
          amount: action.rule === 'equal_among_selected' ? null : (s.amount ?? null),
        })),
      };
      return { ...state, panels };
    }

    case 'SET_PANEL_MEMBER': {
      const idx = state.panels.findIndex((p) => p.itemId === action.itemId);
      if (idx < 0) return state;
      const panels = state.panels.slice();
      const prev = panels[idx];
      const selections = prev.selections.slice();
      const memberIdx = selections.findIndex((s) => s.memberId === action.memberId);
      if (action.included) {
        if (memberIdx < 0) selections.push({ memberId: action.memberId, amount: null });
      } else if (memberIdx >= 0) {
        selections.splice(memberIdx, 1);
      }
      panels[idx] = { ...prev, selections };
      return { ...state, panels };
    }

    case 'SET_PANEL_AMOUNT': {
      const idx = state.panels.findIndex((p) => p.itemId === action.itemId);
      if (idx < 0) return state;
      const panels = state.panels.slice();
      const prev = panels[idx];
      const selections = prev.selections.slice();
      const memberIdx = selections.findIndex((s) => s.memberId === action.memberId);
      if (memberIdx < 0) {
        selections.push({ memberId: action.memberId, amount: action.amount });
      } else {
        selections[memberIdx] = { ...selections[memberIdx], amount: action.amount };
      }
      panels[idx] = { ...prev, selections };
      return { ...state, panels };
    }

    case 'SET_CURRENT_STEP':
      return { ...state, currentStepId: action.stepId };

    case 'SAVE_STARTED':
      return { ...state, saveStatus: 'saving', saveError: null };

    case 'SAVE_SUCCEEDED':
      return { ...state, saveStatus: 'saved', saveError: null };

    case 'SAVE_FAILED':
      return { ...state, saveStatus: 'error', saveError: action.error };
  }
}

// ─── Selectors ───────────────────────────────────────────────────────────

export type WizardStepSkeleton = {
  id: string;
  title: string;
  kind: 'share_groups' | 'item_panel' | 'review';
  status: 'future' | 'active' | 'completed';
  /** When kind === 'item_panel', the item this panel covers. */
  itemId?: string;
};

/**
 * Build the wizard's step list. The screen layer maps these onto
 * WizardStepDescriptor[] by attaching `content` and `summary` render
 * slots.
 *
 * Status rule:
 *   - If `state.currentStepId === step.id`, status = 'active'.
 *   - Else if the step's domain criteria are met, status = 'completed'.
 *   - Else status = 'future'.
 *
 * Step list:
 *   1. Share groups (always present).
 *   2..N. One per individual item (in expenseItems sort order).
 *   N+1. Review.
 *
 * The Review step's "domain completion" is the save itself — it stays
 * `active`-or-`future` until SAVE_SUCCEEDED, then becomes `completed`.
 */
export function wizardSteps(state: SplitDraft): WizardStepSkeleton[] {
  const items = state.expenseItems;
  const itemMap = new Map(items.map((i) => [i.id, i] as const));

  const groupsComplete = isStep1Complete(state);
  const panelStatuses = new Map<string, boolean>();
  for (const p of state.panels)
    panelStatuses.set(p.itemId, isPanelComplete(p, itemMap.get(p.itemId)));

  const out: WizardStepSkeleton[] = [];
  out.push({
    id: SHARE_GROUPS_STEP_ID,
    title: 'Share groups',
    kind: 'share_groups',
    status: statusFor(state.currentStepId, SHARE_GROUPS_STEP_ID, groupsComplete),
  });

  // Per-item panels in stable item sort order
  const orderedIndividuals = items
    .filter((i) => state.individualItemIds.includes(i.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  for (const item of orderedIndividuals) {
    const id = panelStepId(item.id);
    const done = panelStatuses.get(item.id) === true;
    out.push({
      id,
      title: item.name,
      kind: 'item_panel',
      status: statusFor(state.currentStepId, id, done),
      itemId: item.id,
    });
  }

  // Review is "completed" only after a successful save. Otherwise it
  // toggles between future/active based on currentStepId.
  const reviewDone = state.saveStatus === 'saved';
  out.push({
    id: REVIEW_STEP_ID,
    title: 'Review',
    kind: 'review',
    status: statusFor(state.currentStepId, REVIEW_STEP_ID, reviewDone),
  });

  return out;
}

function statusFor(
  currentStepId: string,
  stepId: string,
  domainComplete: boolean,
): WizardStepSkeleton['status'] {
  if (currentStepId === stepId) return 'active';
  if (domainComplete) return 'completed';
  return 'future';
}

/**
 * Coverage of every line item.
 *   - covered: items in any share group (regardless of whether membership
 *     is non-empty) or backed by a complete panel
 *   - remaining: items either individual-without-a-complete-panel, or
 *     items orphaned (not in any group and not individual — shouldn't
 *     happen, but we surface it instead of silently dropping)
 */
export function coverage(state: SplitDraft): { covered: string[]; remaining: string[] } {
  const covered: string[] = [];
  const remaining: string[] = [];
  const itemMap = new Map(state.expenseItems.map((i) => [i.id, i] as const));
  const inGroup = new Set<string>();
  for (const g of state.shareGroups) for (const itemId of g.itemIds) inGroup.add(itemId);
  const panelByItem = new Map(state.panels.map((p) => [p.itemId, p] as const));

  for (const item of state.expenseItems) {
    if (inGroup.has(item.id)) {
      // In a group with at least one member → covered. A group with no
      // members would be invalid; SET_SHARE_GROUP_MEMBERS rejects empty.
      const group = state.shareGroups.find((g) => g.itemIds.includes(item.id));
      if (group && group.memberIds.length > 0) covered.push(item.id);
      else remaining.push(item.id);
      continue;
    }
    if (state.individualItemIds.includes(item.id)) {
      const panel = panelByItem.get(item.id);
      if (panel && isPanelComplete(panel, itemMap.get(item.id))) covered.push(item.id);
      else remaining.push(item.id);
      continue;
    }
    remaining.push(item.id);
  }
  return { covered, remaining };
}

export function canSave(state: SplitDraft): boolean {
  if (state.expenseItems.length === 0) return true; // nothing to split (per §5.7 empty state)
  return coverage(state).remaining.length === 0;
}

/**
 * Resolve the current draft into ItemAttribution[] suitable for the
 * distribute math. Share-group items split equally among the group's
 * members; individual items use the panel's per-member amounts.
 *
 * If a panel is incomplete, that item is omitted (the caller should gate
 * on canSave first).
 */
export function buildItemAttributions(state: SplitDraft): ItemAttribution[] {
  const out: ItemAttribution[] = [];
  const groupForItem = new Map<string, ShareGroupDraft>();
  for (const g of state.shareGroups) for (const itemId of g.itemIds) groupForItem.set(itemId, g);
  const panelByItem = new Map(state.panels.map((p) => [p.itemId, p] as const));
  const itemMap = new Map(state.expenseItems.map((i) => [i.id, i] as const));

  for (const item of state.expenseItems) {
    const group = groupForItem.get(item.id);
    if (group && group.memberIds.length > 0) {
      const memberOrder = orderedMembers(group.memberIds, state.members);
      const splits = equalSplit(item.amount, memberOrder.length);
      const shares = new Map<string, bigint>();
      memberOrder.forEach((m, i) => shares.set(m, splits[i]));
      out.push({ itemId: item.id, amount: item.amount, shares });
      continue;
    }
    if (state.individualItemIds.includes(item.id)) {
      const panel = panelByItem.get(item.id);
      if (!panel) continue;
      if (!isPanelComplete(panel, itemMap.get(item.id))) continue;
      out.push({
        itemId: item.id,
        amount: item.amount,
        shares: resolvePanelShares(panel, item, state.members),
      });
    }
  }
  return out;
}

export function memberSubtotals(state: SplitDraft): Map<string, bigint> {
  return memberSubtotalsFromItems(buildItemAttributions(state));
}

export function proportionalCharges(state: SplitDraft): Map<string, bigint> {
  const breakdown = breakdownPerMember(state);
  const out = new Map<string, bigint>();
  for (const [memberId, b] of breakdown) out.set(memberId, b.charges);
  return out;
}

export function breakdownPerMember(state: SplitDraft): Map<string, MemberBreakdown> {
  const items = buildItemAttributions(state);
  const charges: Charges = {
    service_charge: state.expense.service_charge,
    tip: state.expense.tip,
    tax_amount: state.expense.tax_amount,
  };
  return distributeProportional(
    items,
    state.members.map((m) => m.id),
    charges,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────

function initialStepId(items: SplittingExpenseItem[], defaultGroup: ShareGroupDraft): string {
  // If the default share group already covers every item, skip past
  // Step 1 to the Review surface. This is the common "all shared"
  // happy path — the 4-tap acceptance criterion in §9 needs it.
  if (items.length === 0) return REVIEW_STEP_ID;
  if (defaultGroup.itemIds.length === items.length && defaultGroup.memberIds.length > 0) {
    return REVIEW_STEP_ID;
  }
  return SHARE_GROUPS_STEP_ID;
}

function isStep1Complete(state: SplitDraft): boolean {
  // Step 1 is complete once every item is either in a non-empty share
  // group or has been pulled into the individual bucket. Whether the
  // individual panels themselves are filled is a downstream concern.
  if (state.expenseItems.length === 0) return true;
  const accountedFor = new Set<string>();
  for (const g of state.shareGroups) {
    if (g.memberIds.length === 0) continue;
    for (const itemId of g.itemIds) accountedFor.add(itemId);
  }
  for (const itemId of state.individualItemIds) accountedFor.add(itemId);
  for (const item of state.expenseItems) {
    if (!accountedFor.has(item.id)) return false;
  }
  return true;
}

function isPanelComplete(
  panel: PerPersonPanelDraft,
  item: SplittingExpenseItem | undefined,
): boolean {
  if (!item) return false;
  if (panel.selections.length === 0) return false;
  if (panel.rule === 'equal_among_selected') {
    // Any non-empty selection equally splits item.amount; always complete.
    return true;
  }
  // explicit_amount: every selection must have a non-null amount and the
  // sum must equal the item amount.
  let sum = 0n;
  for (const s of panel.selections) {
    if (s.amount === null) return false;
    sum += s.amount;
  }
  return sum === item.amount;
}

function resolvePanelShares(
  panel: PerPersonPanelDraft,
  item: SplittingExpenseItem,
  members: readonly SplittingMember[],
): Map<string, bigint> {
  if (panel.rule === 'explicit_amount') {
    const shares = new Map<string, bigint>();
    for (const s of panel.selections) {
      shares.set(s.memberId, s.amount ?? 0n);
    }
    return shares;
  }
  const memberOrder = orderedMembers(
    panel.selections.map((s) => s.memberId),
    members,
  );
  const splits = equalSplit(item.amount, memberOrder.length);
  const shares = new Map<string, bigint>();
  memberOrder.forEach((m, i) => shares.set(m, splits[i]));
  return shares;
}

function orderedMembers(ids: readonly string[], members: readonly SplittingMember[]): string[] {
  // Stable order = the trip's member order. This is what feeds equalSplit
  // so the residual cent lands on the same person on every recompute.
  const set = new Set(ids);
  return members.map((m) => m.id).filter((id) => set.has(id));
}

function makeDefaultPanel(item: SplittingExpenseItem): PerPersonPanelDraft {
  return {
    itemId: item.id,
    rule: 'equal_among_selected',
    // Default selection: nobody. The user explicitly picks the people for
    // an individual item (that's the point of making it individual).
    selections: [],
  };
}

function matchShareSetId(
  memberIds: readonly string[],
  shareSets: readonly ShareSetSuggestion[],
): string | null {
  const key = membershipKey(memberIds);
  for (const s of shareSets) {
    if (membershipKey(s.memberIds) === key) return s.id;
  }
  return null;
}

function defaultGroupName(
  memberIds: readonly string[],
  members: readonly SplittingMember[],
): string {
  const nameById = new Map(members.map((m) => [m.id, m.display_name] as const));
  const names = memberIds.map((id) => nameById.get(id) ?? '').filter((n) => n.length > 0);
  if (names.length === 0) return 'Share group';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names[1]} (+${names.length - 2} more)`;
}

function dedupe<T>(xs: readonly T[]): T[] {
  return Array.from(new Set(xs));
}
