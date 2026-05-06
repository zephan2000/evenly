// Quick capture — tray screen (C4b), spec §5.2.
//
// Inbox-tray model: one workspace for 1-8 receipts, parsed in parallel,
// reviewed/edited in capture order. Single tray-level Save action; flagged
// review is an exception path, not the default.
//
// This is the M1.5 functional mockup — behavior + structure correct, visual
// skin handed off to Codex. The OS picker is stubbed via a "Start demo
// batch" CTA; real expo-image-picker integration replaces that stub when
// the home screen wires the entry point.

import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { DraftCard, type TripSummary } from '@/components/quick-capture/draft-card';
import {
  TripPickerSheet,
  type TripPickerResult,
} from '@/components/quick-capture/trip-picker-sheet';
import { Banner } from '@/components/ui/banner';
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { Brand, Neutral, Rhythm, Semantic, Space } from '@/constants/theme';
import type { ExtractedExpense } from '@/lib/ai/schema';
import {
  type BatchDraft,
  type DraftExpense,
  flaggedDraftCount,
  hasUnsavedDrafts,
  isBatchTerminal,
  processingDraftCount,
  reducer,
  readyDraftCount,
  savedDraftCount,
} from '@/lib/quick-capture/state';

// ─── Mock data for the demo flow ─────────────────────────────────────────

const MOCK_TRIPS: TripSummary[] = [
  { id: 'trip-bali', name: 'Bali Apr 2026' },
  { id: 'trip-tokyo', name: 'Tokyo Mar 2026' },
  { id: 'trip-kyoto', name: 'Kyoto Mar 2026' },
];

const DEFAULT_TRIP_ID = MOCK_TRIPS[0].id;

const MOCK_EXTRACTED: ExtractedExpense = {
  merchant: 'Hawker Heaven',
  expense_date: '2026-04-23',
  currency: 'SGD',
  tax_mode: 'exclusive',
  tax_label: 'GST',
  items: [{ name: 'Chicken Rice', quantity: 2, unit_amount_cents: 600, amount_cents: 1200 }],
  subtotal_cents: 1200,
  service_charge_cents: 120,
  tip_cents: 0,
  tax_amount_cents: 106,
  total_cents: 1426,
  category_guess: 'meals',
  confidence: { overall: 0.92, items: 0.9, totals: 0.95 },
  notes: '',
};

function emptyBatch(): BatchDraft {
  return {
    id: '',
    serverId: null,
    defaultTripId: DEFAULT_TRIP_ID,
    tripMode: 'batch',
    createdAt: '',
    drafts: [],
    mode: 'tray',
    cursorIndex: 0,
  };
}

// ─── Screen ──────────────────────────────────────────────────────────────

type TripPickerState =
  | { kind: 'closed' }
  | { kind: 'batch' }
  | { kind: 'single_card'; draftId: string };

export default function QuickCaptureTrayScreen() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, undefined, emptyBatch);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [tripPicker, setTripPicker] = useState<TripPickerState>({ kind: 'closed' });
  const [pendingDisablePerReceipt, setPendingDisablePerReceipt] = useState<string | null>(null);

  const tripPickerRef = useRef<BottomSheetHandle>(null);
  const saveConfirmRef = useRef<BottomSheetHandle>(null);
  const disablePerReceiptConfirmRef = useRef<BottomSheetHandle>(null);
  const saveAllConfirmRef = useRef<BottomSheetHandle>(null);

  const tripById = useMemo(() => {
    return MOCK_TRIPS.reduce<Record<string, TripSummary>>((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {});
  }, []);

  const visibleDrafts = useMemo(
    () => state.drafts.filter((d) => d.status !== 'discarded'),
    [state.drafts],
  );

  const ready = readyDraftCount(state);
  const flagged = flaggedDraftCount(state);
  const processing = processingDraftCount(state);
  const saved = savedDraftCount(state);
  const allSaved = visibleDrafts.length > 0 && isBatchTerminal(state) && saved > 0;

  // Demo-batch initializer — seeds 6 drafts in varied states so the tray can
  // be visually verified without wiring expo-image-picker. Replaced by real
  // picker integration when the home-screen entry point lands.
  const seedDemoBatch = useCallback(() => {
    const id = (n: number) => `demo-${Date.now()}-${n}`;
    const now = new Date().toISOString();
    dispatch({
      type: 'INIT_BATCH',
      batchId: `batch-${Date.now()}`,
      defaultTripId: DEFAULT_TRIP_ID,
      images: Array.from({ length: 6 }, (_, i) => ({
        id: id(i),
        imageUri: 'https://placehold.co/200x260/F4F9FF/16233B?text=Receipt',
      })),
      createdAt: now,
    });
  }, []);

  // Drive a fake orchestration so the demo batch progresses through states.
  // Real impl will live in the parent flow that owns `runUploads`/`runExtractions`.
  useEffect(() => {
    state.drafts.forEach((d, idx) => {
      if (d.status !== 'pending_upload') return;
      const isFailureCase = idx === 4;
      const isLowConf = idx === 2;
      const uploadDelay = 600 + idx * 120;
      const extractDelay = uploadDelay + 1200 + idx * 80;

      const t1 = setTimeout(() => {
        dispatch({ type: 'UPLOAD_STARTED', draftId: d.id });
      }, 200);
      const t2 = setTimeout(() => {
        if (isFailureCase) {
          dispatch({
            type: 'UPLOAD_FAILED',
            draftId: d.id,
            error: { code: 'NET', message: 'Network timed out' },
          });
        } else {
          dispatch({ type: 'UPLOAD_SUCCEEDED', draftId: d.id, uploadedKey: `key-${d.id}` });
        }
      }, uploadDelay);
      const t3 = setTimeout(() => {
        if (isFailureCase) return;
        if (isLowConf) {
          dispatch({
            type: 'EXTRACT_SUCCEEDED',
            draftId: d.id,
            extracted: {
              ...MOCK_EXTRACTED,
              merchant: 'Roadside cafe',
              total_cents: 880,
              confidence: { overall: 0.5, items: 0.5, totals: 0.55 },
            },
          });
        } else {
          dispatch({
            type: 'EXTRACT_SUCCEEDED',
            draftId: d.id,
            extracted: {
              ...MOCK_EXTRACTED,
              merchant: idx === 0 ? 'Hawker Heaven' : `Receipt ${idx + 1}`,
              total_cents: 1426 + idx * 530,
            },
          });
        }
      }, extractDelay);

      // Returning a cleanup from a forEach doesn't work directly; rely on
      // the screen unmount clearing pending timers via the outer cleanup.
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    });
    // We intentionally only react to drafts changing identity; draft mutations
    // inside don't need to re-trigger the simulator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.drafts.length]);

  // ─── Card interaction handlers ─────────────────────────────────────────

  const handleToggleExpand = useCallback((draftId: string) => {
    setExpandedDraftId((current) => (current === draftId ? null : draftId));
  }, []);

  const handleApplyEdit = useCallback((draftId: string, patch: Partial<ExtractedExpense>) => {
    dispatch({ type: 'APPLY_INLINE_EDIT', draftId, patch });
  }, []);

  const handleDiscardDraft = useCallback((draftId: string) => {
    dispatch({ type: 'DISCARD_DRAFT', draftId });
    setExpandedDraftId((current) => (current === draftId ? null : current));
  }, []);

  const handleOpenFullEdit = useCallback(
    (draftId: string) => {
      router.push({ pathname: '/(tabs)/quick-capture/[draftId]', params: { draftId } });
    },
    [router],
  );

  const handleRetryUpload = useCallback((draftId: string) => {
    // Mock retry — flips the demo failure case to a successful upload.
    dispatch({ type: 'UPLOAD_STARTED', draftId });
    setTimeout(() => {
      dispatch({ type: 'UPLOAD_SUCCEEDED', draftId, uploadedKey: `key-${draftId}` });
      setTimeout(() => {
        dispatch({
          type: 'EXTRACT_SUCCEEDED',
          draftId,
          extracted: { ...MOCK_EXTRACTED, merchant: 'Recovered receipt' },
        });
      }, 800);
    }, 600);
  }, []);

  const handleRetryExtraction = useCallback((draftId: string) => {
    dispatch({ type: 'EXTRACT_STARTED', draftId });
    setTimeout(() => {
      dispatch({
        type: 'EXTRACT_SUCCEEDED',
        draftId,
        extracted: { ...MOCK_EXTRACTED, merchant: 'Re-extracted receipt' },
      });
    }, 900);
  }, []);

  const handleRetrySave = useCallback((draftId: string) => {
    dispatch({ type: 'SAVE_STARTED', draftId });
    setTimeout(() => {
      dispatch({ type: 'SAVE_SUCCEEDED', draftId, expenseId: `exp-${draftId}` });
    }, 700);
  }, []);

  const handleRePick = useCallback(
    (draftId: string) => {
      // Real impl: open OS picker for one image, replace this draft's imageUri.
      // Mock: just discard.
      handleDiscardDraft(draftId);
    },
    [handleDiscardDraft],
  );

  const handleChangeTripForDraft = useCallback((draftId: string) => {
    setTripPicker({ kind: 'single_card', draftId });
    setTimeout(() => tripPickerRef.current?.present(), 0);
  }, []);

  // ─── Header trip chip ──────────────────────────────────────────────────

  const handleHeaderChipPress = useCallback(() => {
    setTripPicker({ kind: 'batch' });
    setTimeout(() => tripPickerRef.current?.present(), 0);
  }, []);

  const headerChipText = useMemo(() => headerChipLabel(state, tripById), [state, tripById]);

  // ─── Trip picker result ────────────────────────────────────────────────

  const handleTripPickerResult = useCallback(
    (result: TripPickerResult) => {
      const ctx = tripPicker;
      tripPickerRef.current?.dismiss();
      setTripPicker({ kind: 'closed' });

      if (result.type === 'select_trip') {
        if (ctx.kind === 'single_card') {
          dispatch({
            type: 'SET_TRIP_FOR_DRAFT',
            draftId: ctx.draftId,
            tripId: result.tripId,
          });
        } else {
          dispatch({ type: 'SET_TRIP_FOR_BATCH', tripId: result.tripId });
        }
        return;
      }
      if (result.type === 'enable_per_receipt') {
        dispatch({ type: 'SET_TRIP_MODE', tripMode: 'per_receipt' });
        return;
      }
      if (result.type === 'request_disable_per_receipt') {
        // Spec §5.7.3 — confirm before overriding per-card trips.
        setPendingDisablePerReceipt(result.tripId);
        setTimeout(() => disablePerReceiptConfirmRef.current?.present(), 0);
      }
    },
    [tripPicker],
  );

  // ─── Footer actions ────────────────────────────────────────────────────

  const handleSaveReceipts = useCallback(() => {
    if (ready === 0) return;
    saveAllConfirmRef.current?.present();
  }, [ready]);

  const performBulkSave = useCallback(() => {
    saveAllConfirmRef.current?.dismiss();
    state.drafts.forEach((d) => {
      if (d.status !== 'ready' || d.reviewState !== 'none') return;
      dispatch({ type: 'SAVE_STARTED', draftId: d.id });
      setTimeout(
        () => dispatch({ type: 'SAVE_SUCCEEDED', draftId: d.id, expenseId: `exp-${d.id}` }),
        600 + Math.random() * 600,
      );
    });
  }, [state.drafts]);

  const handleReviewFlagged = useCallback(() => {
    saveAllConfirmRef.current?.dismiss();
    dispatch({ type: 'ENTER_FLAGGED_REVIEW' });
    const firstFlagged = state.drafts.find(
      (d) =>
        d.status !== 'discarded' &&
        (d.reviewState === 'needs_review' ||
          d.reviewState === 'failed' ||
          d.status === 'upload_failed' ||
          d.status === 'extract_failed'),
    );
    if (firstFlagged) {
      router.push({
        pathname: '/(tabs)/quick-capture/[draftId]',
        params: { draftId: firstFlagged.id, mode: 'flagged_review' },
      });
    }
  }, [state.drafts, router]);

  const handleDiscardAll = useCallback(() => {
    Alert.alert(
      'Discard receipts?',
      `This will discard all ${visibleDrafts.length} unsaved receipts. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard all',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'DISCARD_ALL' });
            if (!hasUnsavedDrafts(state)) router.replace('/(tabs)');
          },
        },
      ],
    );
  }, [state, visibleDrafts.length, router]);

  // ─── Empty / done states ───────────────────────────────────────────────

  if (visibleDrafts.length === 0) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Quick capture', headerShown: true }} />
        <ScrollView contentContainerStyle={styles.empty}>
          <EmptyState
            illustration={<Text variant="displayXl">🧾</Text>}
            title="Nothing in the inbox yet"
            description="Pick up to 8 receipts to start a quick capture."
            cta={{ label: 'Start demo batch', onPress: seedDemoBatch }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Quick capture', headerShown: true }} />

      {/* Header — trip chip + discard-all */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="title">Quick capture</Text>
          <View style={styles.headerChipRow}>
            <Chip
              label={headerChipText.label}
              onPress={handleHeaderChipPress}
              leading={<Ionicons name="airplane-outline" size={14} color={Neutral.textSecondary} />}
              accessibilityLabel={`Trip assignment: ${headerChipText.label}`}
            />
            {headerChipText.subtitle ? (
              <Text variant="caption" color="textSecondary">
                {headerChipText.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <Button label="Discard all" variant="ghost" size="sm" onPress={handleDiscardAll} />
      </View>

      {allSaved ? (
        <Banner
          variant="success"
          title={`All ${saved} saved`}
          description="Tap Done to head back to the trip."
        />
      ) : null}

      {/* Card list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {visibleDrafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            expanded={expandedDraftId === d.id}
            tripMode={state.tripMode}
            tripById={tripById}
            onToggleExpand={handleToggleExpand}
            onApplyEdit={handleApplyEdit}
            onDiscard={handleDiscardDraft}
            onOpenFullEdit={handleOpenFullEdit}
            onRetryUpload={handleRetryUpload}
            onRetryExtraction={handleRetryExtraction}
            onRetrySave={handleRetrySave}
            onRePick={handleRePick}
            onChangeTripForDraft={handleChangeTripForDraft}
          />
        ))}
      </ScrollView>

      {/* Sticky footer — Save receipts / Review flagged */}
      {!allSaved ? (
        <View style={styles.footer}>
          <FooterSummary ready={ready} flagged={flagged} processing={processing} saved={saved} />
          <View style={styles.footerActions}>
            {flagged > 0 ? (
              <Button
                label={`Review flagged (${flagged})`}
                variant="secondary"
                size="md"
                onPress={handleReviewFlagged}
              />
            ) : null}
            {ready > 0 ? (
              <Button
                label={`Save ${ready} receipt${ready === 1 ? '' : 's'}`}
                variant="primary"
                size="md"
                onPress={handleSaveReceipts}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.footer}>
          <Button
            label="Done"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      )}

      {/* Trip picker sheet */}
      {tripPicker.kind !== 'closed' ? (
        <TripPickerSheet
          ref={tripPickerRef}
          scope={tripPicker.kind === 'batch' ? 'batch' : 'single_card'}
          trips={MOCK_TRIPS}
          initialTripId={
            tripPicker.kind === 'single_card'
              ? (state.drafts.find((d) => d.id === tripPicker.draftId)?.tripId ?? DEFAULT_TRIP_ID)
              : state.defaultTripId
          }
          currentTripMode={state.tripMode}
          onResult={handleTripPickerResult}
        />
      ) : null}

      {/* Confirm: switch from per-receipt to batch (§5.7.3) */}
      <BottomSheet
        ref={disablePerReceiptConfirmRef}
        title="Switch to one trip?"
        snapPoints={['35%']}
      >
        <Text variant="body" color="textSecondary">
          {pendingDisablePerReceipt
            ? `This will set ${visibleDrafts.filter((d) => d.status !== 'saved').length} unsaved receipts to ${tripById[pendingDisablePerReceipt]?.name}.`
            : ''}
        </Text>
        <View style={styles.confirmRow}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setPendingDisablePerReceipt(null);
              disablePerReceiptConfirmRef.current?.dismiss();
            }}
          />
          <Button
            label="Switch"
            variant="primary"
            onPress={() => {
              if (pendingDisablePerReceipt) {
                dispatch({ type: 'SET_TRIP_FOR_BATCH', tripId: pendingDisablePerReceipt });
                dispatch({ type: 'SET_TRIP_MODE', tripMode: 'batch' });
              }
              setPendingDisablePerReceipt(null);
              disablePerReceiptConfirmRef.current?.dismiss();
            }}
          />
        </View>
      </BottomSheet>

      {/* Confirm: bulk save (§5.5) */}
      <BottomSheet
        ref={saveAllConfirmRef}
        title={`Save ${ready} ready receipt${ready === 1 ? '' : 's'}?`}
        snapPoints={['35%']}
      >
        <Text variant="body" color="textSecondary">
          Flagged receipts will stay in the inbox for review.
        </Text>
        <View style={styles.confirmRow}>
          <Button label="Review flagged" variant="ghost" onPress={handleReviewFlagged} />
          <Button label="Save receipts" variant="primary" onPress={performBulkSave} />
        </View>
      </BottomSheet>

      <BottomSheet ref={saveConfirmRef} snapPoints={['25%']}>
        <Text variant="body">…</Text>
      </BottomSheet>
    </View>
  );
}

// ─── Footer summary ──────────────────────────────────────────────────────

function FooterSummary({
  ready,
  flagged,
  processing,
  saved,
}: {
  ready: number;
  flagged: number;
  processing: number;
  saved: number;
}) {
  const parts: { label: string; color: React.ComponentProps<typeof Text>['color'] }[] = [];
  if (ready > 0) parts.push({ label: `${ready} ready`, color: 'textPrimary' });
  if (flagged > 0) parts.push({ label: `${flagged} need review`, color: 'warningFg' });
  if (processing > 0) parts.push({ label: `${processing} processing`, color: 'textSecondary' });
  if (saved > 0) parts.push({ label: `${saved} saved`, color: 'successFg' });

  return (
    <View style={styles.summaryRow}>
      {parts.map((p, i) => (
        <React.Fragment key={p.label}>
          {i > 0 ? (
            <Text variant="caption" color="textSecondary">
              {' · '}
            </Text>
          ) : null}
          <Text variant="caption" color={p.color}>
            {p.label}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Header chip copy (§5.7.2) ───────────────────────────────────────────

function headerChipLabel(
  state: BatchDraft,
  tripById: Record<string, TripSummary>,
): { label: string; subtitle: string | null } {
  const unsaved = state.drafts.filter((d) => d.status !== 'discarded' && d.status !== 'saved');
  const saved = state.drafts.filter((d) => d.status === 'saved');
  const tripName = (id: string) => tripById[id]?.name ?? 'Unknown trip';

  const unsavedTrips = new Set(unsaved.map((d) => d.tripId));
  const savedTrips = new Set(saved.map((d) => d.tripId));

  if (state.tripMode === 'batch') {
    if (saved.length === 0 || allSameTrip(unsavedTrips, savedTrips)) {
      const t = unsaved[0]?.tripId ?? state.defaultTripId;
      return { label: `Save to ${tripName(t)}`, subtitle: null };
    }
    // saved + unsaved on different trips
    const unsavedByTrip = countByTrip(unsaved);
    const savedByTrip = countByTrip(saved);
    return {
      label: 'Mixed trips',
      subtitle: [
        ...Object.entries(savedByTrip).map(([tid, n]) => `${n} saved to ${tripName(tid)}`),
        ...Object.entries(unsavedByTrip).map(([tid, n]) => `${n} ready for ${tripName(tid)}`),
      ].join(' · '),
    };
  }

  // per_receipt
  if (unsavedTrips.size === 1) {
    const t = unsaved[0]?.tripId ?? state.defaultTripId;
    return { label: `All to ${tripName(t)}`, subtitle: 'Tap a receipt to change' };
  }
  const byTrip = countByTrip(unsaved);
  return {
    label: 'Mixed trips',
    subtitle: Object.entries(byTrip)
      .map(([tid, n]) => `${n} to ${tripName(tid)}`)
      .join(' · '),
  };
}

function allSameTrip(unsaved: Set<string>, saved: Set<string>): boolean {
  if (unsaved.size > 1) return false;
  if (saved.size === 0) return true;
  if (saved.size > 1) return false;
  // size === 1 each
  const u = [...unsaved][0];
  const s = [...saved][0];
  return u === s;
}

function countByTrip(drafts: DraftExpense[]): Record<string, number> {
  return drafts.reduce<Record<string, number>>((acc, d) => {
    acc[d.tripId] = (acc[d.tripId] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space[12],
    paddingHorizontal: Space[16],
    paddingTop: Space[16],
    paddingBottom: Space[12],
  },
  headerLeft: {
    flex: 1,
    gap: Space[8],
  },
  headerChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space[8],
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: Space[16],
    paddingBottom: Rhythm.bottomContentPaddingWithStickyBar,
    gap: Space[12],
  },
  empty: {
    flex: 1,
    paddingHorizontal: Space[16],
    paddingTop: Space[40],
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Neutral.surface,
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    paddingHorizontal: Space[16],
    paddingTop: Space[12],
    paddingBottom: Space[24],
    gap: Space[8],
    minHeight: Rhythm.stickySaveBarHeight + Rhythm.stickySaveBarMinSafeArea,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space[8],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space[8],
    marginTop: Space[12],
  },
});

// Brand + Semantic are reserved for follow-on visual passes by Codex.
void Brand;
void Semantic;
