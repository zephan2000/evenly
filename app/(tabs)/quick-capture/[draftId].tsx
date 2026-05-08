// Quick capture — batch-mode C5 wrapper, spec §5.3.
//
// Full-screen edit fallback for advanced/manual correction. Renders the
// status row (DotRow + caption per §5.3) above a placeholder editor that
// will be replaced by Codex's polished M1 C5 form when that stabilizes.
//
// State note: this screen is read-only against the parent's reducer. Edits
// here would be patched via APPLY_INLINE_EDIT once the real C5 form is wired
// in. For M1.5 mockup, the screen is a structural shell + navigation chrome.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { DotRow, type DotItem, type DotState } from '@/components/ui/dot-row';
import { Neutral, Space } from '@/constants/theme';
import { type DraftExpense, type VisibleStatus, visibleStatusOf } from '@/lib/quick-capture/state';

// Mock fixtures for the standalone preview — the real screen reads state
// from the parent reducer via context. M1.5 mockup uses a static stub so the
// route is reachable for visual review.
const MOCK_DRAFTS_BY_ID: Record<string, DraftExpense> = {
  'demo-1': {
    id: 'demo-1',
    imageUri: '',
    tripId: 'trip-bali',
    status: 'ready',
    reviewState: 'needs_review',
    uploadedKey: 'k',
    extracted: {
      merchant: 'Roadside cafe',
      expense_date: '2026-04-23',
      currency: 'SGD',
      tax_mode: 'exclusive',
      tax_label: 'GST',
      items: [],
      subtotal_cents: 800,
      service_charge_cents: 0,
      tip_cents: 0,
      tax_amount_cents: 56,
      total_cents: 856,
      category_guess: 'meals',
      confidence: { overall: 0.5, items: 0.5, totals: 0.55 },
      notes: '',
    },
    expenseId: null,
    error: null,
    retryCount: 0,
  },
};

const MOCK_BATCH_ORDER = [
  { id: 'demo-0', visible: 'saved' as VisibleStatus, merchant: 'Hawker Heaven' },
  { id: 'demo-1', visible: 'needs_review' as VisibleStatus, merchant: 'Roadside cafe' },
  { id: 'demo-2', visible: 'ready' as VisibleStatus, merchant: 'Ubud Spa' },
  { id: 'demo-3', visible: 'failed' as VisibleStatus, merchant: 'Receipt 4' },
  { id: 'demo-4', visible: 'ready' as VisibleStatus, merchant: 'Receipt 5' },
  { id: 'demo-5', visible: 'processing' as VisibleStatus, merchant: '…' },
];

export default function QuickCaptureBatchModeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId: string; mode?: string }>();
  const draftId = params.draftId;
  const isFlaggedReview = params.mode === 'flagged_review';

  // Stable options reference — see QC tray screen for why an inline literal
  // here triggers React error #185 under frequent parent re-renders.
  const stackScreenOptions = useMemo(
    () => ({ title: 'Edit receipt', headerShown: true, headerBackTitle: 'Tray' }),
    [],
  );

  const draft = MOCK_DRAFTS_BY_ID[draftId] ?? MOCK_DRAFTS_BY_ID['demo-1'];

  const dotItems: DotItem[] = useMemo(() => {
    return MOCK_BATCH_ORDER.map((m) => ({
      id: m.id,
      state: visibleToDotState(m.visible, m.id === draftId),
      label: m.merchant,
    }));
  }, [draftId]);

  const indexInBatch = MOCK_BATCH_ORDER.findIndex((m) => m.id === draftId);
  const totalCount = MOCK_BATCH_ORDER.length;
  const merchantLabel = draft.extracted?.merchant ?? 'Receipt';
  const captionText = `Receipt ${indexInBatch + 1} of ${totalCount} — ${merchantLabel}`;

  const primaryActionLabel = primaryActionLabelFor({
    isFlaggedReview,
    isLastFlagged: isFlaggedReview && !hasNextFlagged(draftId),
  });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={stackScreenOptions} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <DotRow
            items={dotItems}
            caption={captionText}
            onSelect={(id) =>
              router.replace({
                pathname: '/(tabs)/quick-capture/[draftId]',
                params: { draftId: id, ...(isFlaggedReview ? { mode: 'flagged_review' } : {}) },
              })
            }
            accessibilityLabel={`Receipt ${indexInBatch + 1} of ${totalCount}`}
          />
        </View>

        <Banner
          variant="info"
          title="C5 form goes here"
          description="The full-edit form (Receipt / Items / Totals / Notes) is owned by the M1 single-receipt C5 implementation. This screen will compose that form once it stabilizes; for now it's a structural shell so the dot-row and navigation chrome can be reviewed."
        />

        {visibleStatusOf(draft) === 'needs_review' ? (
          <Banner
            variant="warning"
            title="Needs review"
            description="Confidence was low on this extraction. Touching any field clears the flag."
          />
        ) : null}
        {visibleStatusOf(draft) === 'failed' ? (
          <Banner
            variant="error"
            title="Save failed"
            description="The receipt couldn't be saved. Try Retry save from the tray, or edit and save manually."
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Back to tray"
          variant="ghost"
          size="md"
          onPress={() => router.replace('/(tabs)/quick-capture')}
        />
        <Button
          label={primaryActionLabel}
          variant="primary"
          size="md"
          onPress={() => router.replace('/(tabs)/quick-capture')}
        />
      </View>
    </View>
  );
}

function visibleToDotState(visible: VisibleStatus, isCurrent: boolean): DotState {
  if (isCurrent) return 'current';
  switch (visible) {
    case 'saved':
      return 'saved';
    case 'failed':
      return 'failed';
    case 'needs_review':
      return 'flagged';
    case 'ready':
    case 'processing':
    default:
      return 'untouched';
  }
}

function primaryActionLabelFor({
  isFlaggedReview,
  isLastFlagged,
}: {
  isFlaggedReview: boolean;
  isLastFlagged: boolean;
}): string {
  if (!isFlaggedReview) return 'Done';
  if (isLastFlagged) return 'Done & finish review';
  return 'Done & next flagged';
}

function hasNextFlagged(currentId: string): boolean {
  const idx = MOCK_BATCH_ORDER.findIndex((m) => m.id === currentId);
  return MOCK_BATCH_ORDER.slice(idx + 1).some(
    (m) => m.visible === 'needs_review' || m.visible === 'failed',
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: Space[16],
    gap: Space[16],
    paddingBottom: 120,
  },
  statusRow: {
    paddingVertical: Space[8],
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space[8],
    backgroundColor: Neutral.surface,
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    paddingHorizontal: Space[16],
    paddingTop: Space[12],
    paddingBottom: Space[24],
  },
});
