// Quick capture — full-edit screen (C5 batch-mode wrapper, spec §5.3).
//
// Reached from the tray's per-card "Open full edit" action when inline
// quick-edit isn't enough. Composes the reusable ExpenseEditForm against
// the QC reducer state shared via QuickCaptureProvider so edits flow
// straight back to the tray's view of the draft.
//
// State boundary: this screen is read/write against the same reducer the
// tray reads. APPLY_INLINE_EDIT covers every field the form mutates, so
// the form's onChange just maps a Partial<ExtractedExpense> patch onto a
// dispatch. No local form state.
//
// Status row (DotRow + caption per spec §5.3) is rendered above the form
// via the form's `statusRow` slot. In flagged-review mode the primary
// action label adapts to "Done & next flagged" / "Done & finish review".

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Alert, View } from 'react-native';

import { ExpenseEditForm } from '@/components/expense/expense-edit-form';
import { Banner } from '@/components/ui/banner';
import { DotRow, type DotItem, type DotState } from '@/components/ui/dot-row';
import { Text } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import type { ExtractedExpense } from '@/lib/ai/schema';
import { useQuickCaptureDispatch, useQuickCaptureState } from '@/lib/quick-capture/context';
import { type DraftExpense, type VisibleStatus, visibleStatusOf } from '@/lib/quick-capture/state';

export default function QuickCaptureBatchModeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId: string; mode?: string }>();
  const draftId = params.draftId;
  const isFlaggedReview = params.mode === 'flagged_review';

  const state = useQuickCaptureState();
  const dispatch = useQuickCaptureDispatch();

  // Stable Stack.Screen options — see QC tray for the React #185 reason.
  const stackScreenOptions = useMemo(
    () => ({ title: 'Edit receipt', headerShown: true, headerBackTitle: 'Tray' }),
    [],
  );

  const visibleDrafts = useMemo(
    () => state.drafts.filter((d) => d.status !== 'discarded'),
    [state.drafts],
  );

  const draft = useMemo<DraftExpense | undefined>(
    () => visibleDrafts.find((d) => d.id === draftId),
    [visibleDrafts, draftId],
  );

  const indexInBatch = visibleDrafts.findIndex((d) => d.id === draftId);
  const totalCount = visibleDrafts.length;

  const dotItems: DotItem[] = useMemo(() => {
    return visibleDrafts.map((d) => ({
      id: d.id,
      state: visibleToDotState(visibleStatusOf(d), d.id === draftId),
      label: d.extracted?.merchant ?? '',
    }));
  }, [visibleDrafts, draftId]);

  const handleApplyEdit = useCallback(
    (patch: Partial<ExtractedExpense>) => {
      if (!draftId) return;
      dispatch({ type: 'APPLY_INLINE_EDIT', draftId, patch });
    },
    [dispatch, draftId],
  );

  const handleNavigateToDraft = useCallback(
    (id: string) => {
      router.replace({
        pathname: '/(tabs)/quick-capture/[draftId]',
        params: { draftId: id, ...(isFlaggedReview ? { mode: 'flagged_review' } : {}) },
      });
    },
    [router, isFlaggedReview],
  );

  const handleDone = useCallback(() => {
    if (!isFlaggedReview) {
      router.replace('/(tabs)/quick-capture');
      return;
    }
    // Flagged-review flow: jump to the next still-flagged draft, or back to
    // the tray when all flagged drafts are resolved.
    const nextFlagged = visibleDrafts
      .slice(indexInBatch + 1)
      .find(
        (d) =>
          d.reviewState === 'needs_review' ||
          d.reviewState === 'failed' ||
          d.status === 'upload_failed' ||
          d.status === 'extract_failed',
      );
    if (nextFlagged) {
      handleNavigateToDraft(nextFlagged.id);
    } else {
      router.replace('/(tabs)/quick-capture');
    }
  }, [isFlaggedReview, indexInBatch, visibleDrafts, router, handleNavigateToDraft]);

  // Empty / missing-draft fallback. Happens if the user deep-linked here
  // without a current batch (e.g. cold-launched the route directly), or
  // if the batch was discarded while the screen was open.
  if (!draft || !draft.extracted) {
    return (
      <View style={styles.fallback}>
        <Stack.Screen options={stackScreenOptions} />
        <Banner
          variant="info"
          title="No draft to edit"
          description={
            !draft
              ? "This receipt isn't in the current quick-capture batch. Head back to the tray and try again."
              : 'Extraction is still running. Once it finishes, the form will populate here.'
          }
        />
      </View>
    );
  }

  const visible = visibleStatusOf(draft);
  const merchantLabel = draft.extracted.merchant?.trim() || 'Receipt';
  const captionText = `Receipt ${indexInBatch + 1} of ${totalCount} — ${merchantLabel}`;

  const primaryActionLabel = primaryActionLabelFor({
    isFlaggedReview,
    isLastFlagged: isFlaggedReview && !hasNextFlagged(visibleDrafts, indexInBatch),
  });

  return (
    <>
      <Stack.Screen options={stackScreenOptions} />
      <ExpenseEditForm
        value={draft.extracted}
        onChange={handleApplyEdit}
        receiptImage={draft.imageUri || undefined}
        primaryActionLabel={primaryActionLabel}
        onPrimaryAction={handleDone}
        statusRow={
          totalCount > 1 ? (
            <View style={styles.statusRow}>
              <DotRow
                items={dotItems}
                caption={captionText}
                onSelect={handleNavigateToDraft}
                accessibilityLabel={`Receipt ${indexInBatch + 1} of ${totalCount}`}
              />
            </View>
          ) : null
        }
        topBanner={
          visible === 'needs_review' ? (
            <Banner
              variant="warning"
              title="Needs review"
              description="Confidence was low on this extraction. Touching any field clears the flag."
            />
          ) : visible === 'failed' ? (
            <Banner
              variant="error"
              title="Save failed"
              description="The receipt couldn't be saved. Edit and tap Done to return to the tray and retry."
            />
          ) : null
        }
        onPressReceipt={() => {
          // TODO(quick-capture): full-screen receipt preview is a follow-up.
          Alert.alert(
            'Receipt preview',
            'Full-screen preview is not wired yet. Tap Done to return.',
          );
        }}
      />
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

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

function hasNextFlagged(drafts: DraftExpense[], fromIndex: number): boolean {
  return drafts
    .slice(fromIndex + 1)
    .some(
      (d) =>
        d.reviewState === 'needs_review' ||
        d.reviewState === 'failed' ||
        d.status === 'upload_failed' ||
        d.status === 'extract_failed',
    );
}

const styles = {
  fallback: {
    padding: Space[16],
    gap: Space[12],
  },
  statusRow: {
    paddingVertical: Space[8],
  },
} as const;

// Quiet the tree-shake noise: Text is imported by the form indirectly, but
// we keep the import here in case future status-row variants render it.
void Text;
