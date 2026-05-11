// C7 — Split expense screen.
//
// Composes lib/ux/spotlight-wizard.tsx (the spotlight primitive) with the
// reducer from lib/splitting/state.ts. Working register — neutral
// primitives, no editorial polish. Codex will re-skin in a follow-up.
//
// Behavior contract (see docs/specs/m2-splitting.md §5):
//   - Default share group contains every member and every item, so the
//     happy-path 4-tap acceptance criterion (Split CTA → auto-jump to
//     Review → Save splits) lands here.
//   - Currency is NEVER editable inside the wizard (locked decision §5.6).
//   - Tax / service are never user-assignable (§5.5).
//   - Save goes through /api/expenses/[id]/splits which transactionally
//     replaces every split row + auto-saves new share_sets.

import { useAuth } from '@clerk/clerk-expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Neutral, Space } from '@/constants/theme';
import { getExpense, type ExpenseDetail } from '@/lib/db/expenses';
import { saveExpenseSplits } from '@/lib/db/splits';
import { listTripMembers, type TripMember } from '@/lib/db/trip-members';
import {
  buildItemAttributions,
  canSave,
  coverage,
  DEFAULT_GROUP_ID,
  reducer,
  type SplitDraft,
  type SplittingMember,
  wizardSteps,
  breakdownPerMember,
} from '@/lib/splitting/state';
import { SpotlightWizard } from '@/lib/ux/spotlight-wizard';
import type { WizardStepDescriptor } from '@/lib/ux/spotlight-wizard-logic';
import { formatMinor } from '@/lib/fx/currency';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractIdFromPathname(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const segments = window.location.pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('expenses');
  if (idx < 0) return undefined;
  const candidate = segments[idx + 1];
  return candidate && UUID_RE.test(candidate) ? candidate : undefined;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ExpenseDetail; members: TripMember[] }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export default function SplitExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const expenseId = params.id || extractIdFromPathname();
  const { getToken, isSignedIn } = useAuth();

  const stackOptions = useMemo(
    () => ({ title: 'Split expense', headerShown: true, headerBackTitle: 'Back' }),
    [],
  );

  // ─── Load expense + trip members ─────────────────────────────────────
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async () => {
    if (!expenseId) {
      setLoadState({ kind: 'error', message: 'Missing expense id.' });
      return;
    }
    setLoadState({ kind: 'loading' });
    try {
      const detail = await getExpense(() => getTokenRef.current(), expenseId);
      if (!detail) {
        setLoadState({ kind: 'not_found' });
        return;
      }
      const members = await listTripMembers(() => getTokenRef.current(), detail.expense.trip_id);
      setLoadState({ kind: 'ready', detail, members });
    } catch (e) {
      setLoadState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load',
      });
    }
  }, [expenseId]);

  useEffect(() => {
    if (!isSignedIn) return;
    void load();
  }, [isSignedIn, load]);

  if (loadState.kind === 'loading') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton fullWidth height={120} radius={16} />
          <Skeleton fullWidth height={120} radius={16} />
        </ScrollView>
      </View>
    );
  }

  if (loadState.kind === 'error') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Banner
            variant="error"
            title="Couldn't load this expense"
            description={loadState.message}
          />
          <Button label="Try again" variant="primary" size="md" onPress={load} />
        </ScrollView>
      </View>
    );
  }

  if (loadState.kind === 'not_found') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Banner
            variant="info"
            title="Expense not found"
            description="It may have been deleted, or you don't have access."
          />
          <Button label="Back" variant="primary" size="md" onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <SplitEditor
      detail={loadState.detail}
      members={loadState.members}
      stackOptions={stackOptions}
      onSaved={() => router.replace(`/expenses/${expenseId}`)}
      onCancel={() => router.back()}
    />
  );
}

// ─── Editor (mounted once data is ready) ─────────────────────────────────

type StackOptions = ReturnType<typeof useMemo<{ title: string }>>;

function SplitEditor({
  detail,
  members,
  stackOptions,
  onSaved,
  onCancel,
}: {
  detail: ExpenseDetail;
  members: TripMember[];
  stackOptions: StackOptions;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { expense, items } = detail;
  const { getToken } = useAuth();

  // Map server records → reducer's domain shape (bigint amounts).
  const splittingMembers: SplittingMember[] = useMemo(
    () => members.map((m) => ({ id: m.id, display_name: m.display_name })),
    [members],
  );

  const initialState = useMemo<SplitDraft>(
    () =>
      reducer({} as SplitDraft, {
        type: 'INIT_SPLIT_DRAFT',
        payload: {
          expense: {
            id: expense.id,
            subtotal: BigInt(expense.subtotal),
            service_charge: BigInt(expense.service_charge),
            tip: BigInt(expense.tip),
            tax_amount: BigInt(expense.tax_amount),
            original_amount: BigInt(expense.original_amount),
            original_currency: expense.original_currency,
          },
          items: items.map((it) => ({
            id: it.id,
            name: it.name,
            amount: BigInt(it.amount),
            sort_order: it.sort_order,
          })),
          members: splittingMembers,
          shareSets: [], // suggestions deferred to a follow-up
        },
      }),
    [expense, items, splittingMembers],
  );

  const [state, dispatch] = useReducer(reducer, initialState);
  const [saveError, setSaveError] = useState<string | null>(null);
  const currency = expense.original_currency;

  const handleStepChange = useCallback((stepId: string) => {
    dispatch({ type: 'SET_CURRENT_STEP', stepId });
  }, []);

  const handleMakeIndividual = useCallback((itemId: string) => {
    dispatch({ type: 'MOVE_ITEM_TO_GROUP', itemId, groupId: null });
  }, []);

  const handleReturnToDefault = useCallback((itemId: string) => {
    dispatch({ type: 'MOVE_ITEM_TO_GROUP', itemId, groupId: DEFAULT_GROUP_ID });
  }, []);

  const handleTogglePanelMember = useCallback(
    (itemId: string, memberId: string, included: boolean) => {
      dispatch({ type: 'SET_PANEL_MEMBER', itemId, memberId, included });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!canSave(state)) return;
    dispatch({ type: 'SAVE_STARTED' });
    setSaveError(null);

    const sharePayload = state.shareGroups
      .filter((g) => g.memberIds.length > 0 && g.itemIds.length > 0)
      .map((g) => ({
        share_set_id: g.shareSetId,
        member_ids: g.memberIds,
        item_ids: g.itemIds,
        name: g.name,
      }));
    const panelPayload = state.panels.map((p) => {
      // The server expects an amount per member even for equal_among_selected.
      // We resolve the attribution client-side via buildItemAttributions for
      // the equal case; for explicit_amount we just trust the panel.
      const attrs = buildItemAttributions(state).find((a) => a.itemId === p.itemId);
      const members = p.selections.map((s) => {
        const fromAttr = attrs?.shares.get(s.memberId);
        const amount = p.rule === 'explicit_amount' ? (s.amount ?? 0n) : (fromAttr ?? 0n);
        return { member_id: s.memberId, amount: amount.toString() };
      });
      return { item_id: p.itemId, rule: p.rule, members };
    });

    try {
      await saveExpenseSplits(getToken, expense.id, {
        share_groups: sharePayload,
        individual_panels: panelPayload,
      });
      dispatch({ type: 'SAVE_SUCCEEDED' });
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      dispatch({ type: 'SAVE_FAILED', error: { code: 'save_failed', message: msg } });
      setSaveError(msg);
    }
  }, [state, getToken, expense.id, onSaved]);

  // ─── Build wizard descriptors from reducer skeletons ────────────────
  const skeletons = wizardSteps(state);
  const { remaining } = coverage(state);

  const wizardStepDescriptors: WizardStepDescriptor[] = skeletons.map((sk) => {
    if (sk.kind === 'share_groups') {
      return {
        id: sk.id,
        title: sk.title,
        status: sk.status,
        content: (
          <ShareGroupsContent
            state={state}
            currency={currency}
            onMakeIndividual={handleMakeIndividual}
            onReturnToDefault={handleReturnToDefault}
          />
        ),
        summary: (
          <Text variant="body" color="textSecondary">
            {state.shareGroups
              .filter((g) => g.itemIds.length > 0)
              .map((g) => `${g.name} · ${g.itemIds.length} items`)
              .join(' · ') || 'No groups'}
          </Text>
        ),
      };
    }
    if (sk.kind === 'item_panel' && sk.itemId) {
      const item = items.find((it) => it.id === sk.itemId);
      const panel = state.panels.find((p) => p.itemId === sk.itemId);
      return {
        id: sk.id,
        title: sk.title,
        status: sk.status,
        content: (
          <PerPersonPanelContent
            itemName={item?.name ?? sk.title}
            itemAmount={item ? BigInt(item.amount) : 0n}
            currency={currency}
            members={splittingMembers}
            selectedMemberIds={panel?.selections.map((s) => s.memberId) ?? []}
            rule={panel?.rule ?? 'equal_among_selected'}
            onToggleMember={(memberId, included) =>
              handleTogglePanelMember(sk.itemId!, memberId, included)
            }
            onRuleChange={(rule) => dispatch({ type: 'SET_PANEL_RULE', itemId: sk.itemId!, rule })}
            onReturnToDefault={() => handleReturnToDefault(sk.itemId!)}
          />
        ),
        summary: (
          <Text variant="body" color="textSecondary">
            {panel && panel.selections.length > 0
              ? `${panel.selections.length} person${panel.selections.length === 1 ? '' : 's'}`
              : 'Tap to assign'}
          </Text>
        ),
      };
    }
    // review
    return {
      id: sk.id,
      title: sk.title,
      status: sk.status,
      content: <ReviewContent state={state} currency={currency} members={splittingMembers} />,
      summary: (
        <Text variant="body" color="textSecondary">
          Per-member breakdown
        </Text>
      ),
    };
  });

  const saveLabel =
    remaining.length === 0
      ? 'Save splits'
      : `${remaining.length} item${remaining.length === 1 ? '' : 's'} still need a person · Save splits`;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={stackOptions} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <Text variant="display">Split expense</Text>
          <Text variant="caption" color="textSecondary">
            {expense.merchant || 'Receipt'} · {expense.expense_date}
          </Text>
        </View>

        {saveError ? (
          <Banner variant="error" title="Couldn't save splits" description={saveError} />
        ) : null}

        <SpotlightWizard
          steps={wizardStepDescriptors}
          currentStepId={state.currentStepId}
          onStepChange={handleStepChange}
          saving={state.saveStatus === 'saving'}
          ariaLabel="Splitting wizard"
        />
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerActions}>
          <Button
            label="Cancel"
            variant="secondary"
            size="md"
            onPress={onCancel}
            disabled={state.saveStatus === 'saving'}
          />
          <Button
            label={state.saveStatus === 'saving' ? 'Saving…' : saveLabel}
            variant="primary"
            size="md"
            onPress={handleSave}
            disabled={!canSave(state) || state.saveStatus === 'saving'}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

// ─── Step content blocks (working register; Codex re-skins) ──────────────

function ShareGroupsContent({
  state,
  currency,
  onMakeIndividual,
  onReturnToDefault,
}: {
  state: SplitDraft;
  currency: string;
  onMakeIndividual: (itemId: string) => void;
  onReturnToDefault: (itemId: string) => void;
}) {
  return (
    <View style={blockStyles.stack}>
      <Text variant="caption" color="textSecondary">
        Items default to all members. Pull anything out as individual to assign per person.
      </Text>
      {state.shareGroups
        .filter((g) => g.itemIds.length > 0)
        .map((group) => (
          <Card key={group.id} style={blockStyles.groupCard}>
            <View style={blockStyles.groupHeader}>
              <Text variant="bodyStrong">{group.name}</Text>
              <Text variant="caption" color="textSecondary">
                {group.memberIds.length} member{group.memberIds.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={blockStyles.itemRows}>
              {group.itemIds.map((itemId) => {
                const item = state.expenseItems.find((it) => it.id === itemId);
                if (!item) return null;
                return (
                  <View key={itemId} style={blockStyles.itemRow}>
                    <View style={blockStyles.itemRowLeft}>
                      <Text variant="body" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="caption" color="textSecondary" tabularNums>
                        {currency} {formatMinor(item.amount, currency)}
                      </Text>
                    </View>
                    <Button
                      label="Make individual"
                      variant="secondary"
                      size="sm"
                      onPress={() => onMakeIndividual(itemId)}
                    />
                  </View>
                );
              })}
            </View>
          </Card>
        ))}
      {state.individualItemIds.length > 0 ? (
        <Card style={blockStyles.groupCard}>
          <Text variant="bodyStrong">Individual items</Text>
          <View style={blockStyles.itemRows}>
            {state.individualItemIds.map((itemId) => {
              const item = state.expenseItems.find((it) => it.id === itemId);
              if (!item) return null;
              return (
                <View key={itemId} style={blockStyles.itemRow}>
                  <View style={blockStyles.itemRowLeft}>
                    <Text variant="body" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" color="textSecondary" tabularNums>
                      {currency} {formatMinor(item.amount, currency)}
                    </Text>
                  </View>
                  <Button
                    label="Return to default"
                    variant="secondary"
                    size="sm"
                    onPress={() => onReturnToDefault(itemId)}
                  />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function PerPersonPanelContent({
  itemName,
  itemAmount,
  currency,
  members,
  selectedMemberIds,
  rule,
  onToggleMember,
  onRuleChange,
  onReturnToDefault,
}: {
  itemName: string;
  itemAmount: bigint;
  currency: string;
  members: SplittingMember[];
  selectedMemberIds: string[];
  rule: 'equal_among_selected' | 'explicit_amount';
  onToggleMember: (memberId: string, included: boolean) => void;
  onRuleChange: (rule: 'equal_among_selected' | 'explicit_amount') => void;
  onReturnToDefault: () => void;
}) {
  const selected = new Set(selectedMemberIds);
  return (
    <View style={blockStyles.stack}>
      <View style={blockStyles.panelHeader}>
        <Text variant="bodyStrong">{itemName}</Text>
        <Text variant="bodyStrong" tabularNums>
          {currency} {formatMinor(itemAmount, currency)}
        </Text>
      </View>
      <SegmentedControl
        options={[
          { label: 'Equal split', value: 'equal_among_selected' },
          { label: 'Custom amounts', value: 'explicit_amount' },
        ]}
        value={rule}
        onChange={onRuleChange}
      />
      <View style={blockStyles.itemRows}>
        {members.map((member) => {
          const included = selected.has(member.id);
          return (
            <View key={member.id} style={blockStyles.memberRow}>
              <Text variant="body" style={blockStyles.memberName}>
                {member.display_name}
              </Text>
              <Button
                label={included ? 'Included' : 'Add'}
                variant={included ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => onToggleMember(member.id, !included)}
              />
            </View>
          );
        })}
      </View>
      {rule === 'explicit_amount' ? (
        <Text variant="caption" color="textSecondary">
          Custom amounts UI is working-register; Codex will land the typed-cents inputs.
        </Text>
      ) : null}
      <Button
        label="Return to default group"
        variant="secondary"
        size="sm"
        onPress={onReturnToDefault}
      />
    </View>
  );
}

function ReviewContent({
  state,
  currency,
  members,
}: {
  state: SplitDraft;
  currency: string;
  members: SplittingMember[];
}) {
  const breakdown = breakdownPerMember(state);
  return (
    <View style={blockStyles.stack}>
      <Text variant="caption" color="textSecondary">
        Pre-tax share + each member&apos;s proportional service / tip / tax.
      </Text>
      {members.map((member) => {
        const b = breakdown.get(member.id);
        const total = b?.total ?? 0n;
        const charges = b?.charges ?? 0n;
        const items = b?.charges !== undefined ? total - charges : 0n;
        return (
          <View key={member.id} style={blockStyles.reviewRow}>
            <View style={blockStyles.reviewRowLeft}>
              <Text variant="bodyStrong">{member.display_name}</Text>
              <Text variant="caption" color="textSecondary" tabularNums>
                Items {currency} {formatMinor(items, currency)} · charges {currency}{' '}
                {formatMinor(charges, currency)}
              </Text>
            </View>
            <Text variant="bodyStrong" tabularNums>
              {currency} {formatMinor(total, currency)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: Space[16],
    gap: Space[16],
    paddingBottom: Space[32],
  },
  headerBlock: {
    gap: Space[4],
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    backgroundColor: Neutral.surface,
    paddingHorizontal: Space[16],
    paddingVertical: Space[12],
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[12],
  },
});

const blockStyles = StyleSheet.create({
  stack: { gap: Space[12] },
  groupCard: { padding: Space[12], gap: Space[8] },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  itemRows: { gap: Space[8] },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  itemRowLeft: {
    flex: 1,
    gap: Space[4],
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  memberName: { flex: 1 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space[12],
  },
  reviewRowLeft: { flex: 1, gap: Space[4] },
});
