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

import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { CurrencyPickerSheet } from '@/components/quick-capture/currency-picker-sheet';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Brand, Neutral, Rhythm, Semantic, Space } from '@/constants/theme';
import type { ExtractedExpense } from '@/lib/ai/schema';
import { createTrip, listTrips, type TripRecord } from '@/lib/db/trips';
import { effectiveQuickPicks } from '@/lib/fx/currencies';
import { useQuickCaptureDispatch, useQuickCaptureState } from '@/lib/quick-capture/context';
import { createRealDeps } from '@/lib/quick-capture/deps';
import { runExtractions, runUploads } from '@/lib/quick-capture/orchestrator';
import { pickReceiptImages } from '@/lib/quick-capture/picker';
import {
  type BatchDraft,
  type DraftExpense,
  flaggedDraftCount,
  hasUnsavedDrafts,
  isBatchTerminal,
  MAX_BATCH_IMAGES,
  processingDraftCount,
  readyDraftCount,
  savedDraftCount,
} from '@/lib/quick-capture/state';

// ─── Mock data for the demo flow ─────────────────────────────────────────

// Synthetic placeholder trip used only by the demo-batch simulator (visual
// review path). Real picker batches always use a fetched TripRecord.
const DEMO_PLACEHOLDER_TRIP: TripSummary = { id: 'demo-trip', name: 'Demo trip' };

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

// ─── Trips fetch state ───────────────────────────────────────────────────

type TripsState =
  | { kind: 'loading' }
  | { kind: 'ready'; trips: TripRecord[] }
  | { kind: 'error'; message: string };

// ─── Screen ──────────────────────────────────────────────────────────────

type TripPickerState =
  | { kind: 'closed' }
  | { kind: 'batch' }
  | { kind: 'single_card'; draftId: string };

// Demo-batch URIs are placeholder URLs; real picker output is local file:// or
// http(s)://. We gate the in-memory simulator on this prefix so real batches
// run through the actual orchestrator instead.
const DEMO_URI_PREFIX = 'https://placehold.co';

function isDemoDraft(d: DraftExpense): boolean {
  return d.imageUri.startsWith(DEMO_URI_PREFIX);
}

export default function QuickCaptureTrayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUris?: string; tripId?: string }>();
  const { getToken, isSignedIn } = useAuth();

  // Memoized so Stack.Screen receives a stable options reference and doesn't
  // call setOptions on every render — that pattern produces an infinite
  // commit-phase loop (React error #185) once the parent re-renders often.
  const stackScreenOptions = useMemo(() => ({ title: 'Quick capture', headerShown: true }), []);

  const state = useQuickCaptureState();
  const dispatch = useQuickCaptureDispatch();
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [tripPicker, setTripPicker] = useState<TripPickerState>({ kind: 'closed' });
  const [pendingDisablePerReceipt, setPendingDisablePerReceipt] = useState<string | null>(null);
  const [tripsState, setTripsState] = useState<TripsState>({ kind: 'loading' });
  const [createTripForm, setCreateTripForm] = useState<{ name: string; currency: string }>({
    name: '',
    currency: 'SGD',
  });
  const [creatingTrip, setCreatingTrip] = useState(false);

  const tripPickerRef = useRef<BottomSheetHandle>(null);
  const saveConfirmRef = useRef<BottomSheetHandle>(null);
  const disablePerReceiptConfirmRef = useRef<BottomSheetHandle>(null);
  const saveAllConfirmRef = useRef<BottomSheetHandle>(null);
  const createTripSheetRef = useRef<BottomSheetHandle>(null);

  // One-shot guard so route params don't re-init on every render.
  const initFromParamsRef = useRef<string | null>(null);
  // Phase-in-flight guards for the real orchestrator. Each phase filters by
  // status so re-entry is safe in principle, but we still avoid concurrent
  // runs to prevent dispatching duplicate STARTED actions for the same draft.
  const uploadInFlightRef = useRef(false);
  const extractInFlightRef = useRef(false);

  // Stash getToken in a ref so callbacks/memos that need it don't take it
  // as a dep. Clerk's useAuth() returns a fresh function reference on every
  // render even though the underlying behavior is stable; treating it as a
  // dep destabilizes downstream useMemo/useCallback and re-fires effects on
  // every render, which under heavy state churn (e.g. orchestrator
  // dispatches during upload failures) hits React's commit-recursion limit.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const trips = useMemo<TripRecord[]>(
    () => (tripsState.kind === 'ready' && Array.isArray(tripsState.trips) ? tripsState.trips : []),
    [tripsState],
  );
  const currentTrip = trips[0] ?? null;

  const tripById = useMemo(() => {
    const acc: Record<string, TripSummary> = {
      [DEMO_PLACEHOLDER_TRIP.id]: DEMO_PLACEHOLDER_TRIP,
    };
    for (const t of trips) acc[t.id] = { id: t.id, name: t.name };
    return acc;
  }, [trips]);

  const tripPickerTrips = useMemo<TripSummary[]>(
    () => trips.map((t) => ({ id: t.id, name: t.name })),
    [trips],
  );

  const refetchTrips = useCallback(async () => {
    setTripsState({ kind: 'loading' });
    try {
      const list = await listTrips(() => getTokenRef.current());
      setTripsState({ kind: 'ready', trips: list });
    } catch (e) {
      setTripsState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load trips',
      });
    }
  }, []);

  // Fetch trips once per signed-in session. Use a ref guard rather than
  // tripsState.kind because refetchTrips synchronously sets state to a NEW
  // {kind:'loading'} object — same kind value but a new reference. If the
  // effect re-runs (e.g. because Clerk's getToken makes refetchTrips
  // unstable), a tripsState.kind === 'loading' guard fails to bail out and
  // fires another refetchTrips, kicking off concurrent /api/trips requests
  // until the first one resolves.
  const initialFetchRef = useRef(false);
  useEffect(() => {
    if (!isSignedIn) {
      initialFetchRef.current = false;
      return;
    }
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    void refetchTrips();
  }, [isSignedIn, refetchTrips]);

  const visibleDrafts = useMemo(
    () => state.drafts.filter((d) => d.status !== 'discarded'),
    [state.drafts],
  );

  const ready = readyDraftCount(state);
  const flagged = flaggedDraftCount(state);
  const processing = processingDraftCount(state);
  const saved = savedDraftCount(state);
  const allSaved = visibleDrafts.length > 0 && isBatchTerminal(state) && saved > 0;

  const isRealBatch = visibleDrafts.length > 0 && !isDemoDraft(visibleDrafts[0]);

  // Real orchestrator deps. Created lazily — null until we have a signed-in
  // session, a fetched trip, and a real (non-demo) batch. saveContext uses the
  // owner's trip_member id for both payer and creator: the current user paid
  // and entered the receipt themselves. Per-card payer override is post-MVP.
  const realDeps = useMemo(() => {
    if (!isRealBatch) return null;
    if (!isSignedIn) return null;
    if (!state.defaultTripId) return null;
    const tripForBatch = trips.find((t) => t.id === state.defaultTripId);
    if (!tripForBatch) return null;
    return createRealDeps({
      getToken: () => getTokenRef.current(),
      uploadTripId: tripForBatch.id,
      saveContext: {
        tripId: tripForBatch.id,
        payerMemberId: tripForBatch.owner_member_id,
        createdByMemberId: tripForBatch.owner_member_id,
      },
    });
  }, [isRealBatch, isSignedIn, state.defaultTripId, trips]);

  // ─── Initialize batch from route params (real picker landing) ──────────
  useEffect(() => {
    const raw = params.imageUris;
    if (!raw) return;
    if (initFromParamsRef.current === raw) return;

    let uris: unknown;
    try {
      uris = JSON.parse(raw);
    } catch {
      initFromParamsRef.current = raw;
      return;
    }
    if (!Array.isArray(uris) || uris.length === 0) {
      initFromParamsRef.current = raw;
      return;
    }
    const sliced = (uris as unknown[])
      .filter((u): u is string => typeof u === 'string')
      .slice(0, MAX_BATCH_IMAGES);
    if (sliced.length === 0) {
      initFromParamsRef.current = raw;
      return;
    }

    const tripId = params.tripId ?? currentTrip?.id ?? '';
    if (!tripId) return; // Trips still loading. Re-fires when currentTrip resolves.

    initFromParamsRef.current = raw;
    dispatch({
      type: 'INIT_BATCH',
      batchId: `batch-${Date.now()}`,
      defaultTripId: tripId,
      images: sliced.map((uri, i) => ({
        id: `picked-${Date.now()}-${i}`,
        imageUri: uri,
      })),
      createdAt: new Date().toISOString(),
    });
  }, [params.imageUris, params.tripId, currentTrip]);

  // ─── Real orchestrator: run uploads when there's pending work ──────────
  useEffect(() => {
    if (!realDeps) return;
    const hasPending = state.drafts.some((d) => d.status === 'pending_upload');
    if (!hasPending) return;
    if (uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    runUploads(state, dispatch, realDeps).finally(() => {
      uploadInFlightRef.current = false;
    });
  }, [state, realDeps]);

  // ─── Real orchestrator: run extractions when uploads complete ──────────
  useEffect(() => {
    if (!realDeps) return;
    const hasExtracting = state.drafts.some(
      (d) => d.status === 'extracting' && d.uploadedKey !== null && d.extracted === null,
    );
    if (!hasExtracting) return;
    if (extractInFlightRef.current) return;

    extractInFlightRef.current = true;
    runExtractions(state, dispatch, realDeps).finally(() => {
      extractInFlightRef.current = false;
    });
  }, [state, realDeps]);

  // ─── Picker integration ────────────────────────────────────────────────

  const handlePickReceipts = useCallback(async () => {
    if (!currentTrip) {
      Alert.alert('Create a trip first', 'You need a trip before you can capture receipts.');
      return;
    }
    const result = await pickReceiptImages();
    if (result.kind === 'permission_denied') {
      Alert.alert('Photo access needed', 'Allow photo access to scan receipts.');
      return;
    }
    if (result.kind === 'cancelled') return;
    if (result.images.length === 0) return;
    if (result.truncated) {
      Alert.alert('Some receipts skipped', `Only the first ${MAX_BATCH_IMAGES} will be processed.`);
    }
    // Re-mount this screen with the picked URIs in route params. INIT_BATCH
    // fires once via the param-watching effect, then the real orchestrator
    // takes over.
    router.replace({
      pathname: '/(tabs)/quick-capture',
      params: {
        imageUris: JSON.stringify(result.images.map((i) => i.uri)),
        tripId: currentTrip.id,
      },
    });
  }, [router, currentTrip]);

  // ─── Demo-batch initializer (visual review only) ───────────────────────
  const seedDemoBatch = useCallback(() => {
    const id = (n: number) => `demo-${Date.now()}-${n}`;
    const now = new Date().toISOString();
    dispatch({
      type: 'INIT_BATCH',
      batchId: `batch-${Date.now()}`,
      defaultTripId: currentTrip?.id ?? DEMO_PLACEHOLDER_TRIP.id,
      images: Array.from({ length: 6 }, (_, i) => ({
        id: id(i),
        imageUri: `${DEMO_URI_PREFIX}/200x260/F4F9FF/16233B?text=Receipt`,
      })),
      createdAt: now,
    });
  }, [currentTrip]);

  // Demo-only simulator — drives a fake orchestration so the placeholder
  // batch progresses through states for visual review. Gated on the
  // demo-uri prefix so real picker batches go through the orchestrator
  // effects above instead.
  useEffect(() => {
    if (state.drafts.length === 0) return;
    if (!isDemoDraft(state.drafts[0])) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    state.drafts.forEach((d, idx) => {
      if (d.status !== 'pending_upload') return;
      const isFailureCase = idx === 4;
      const isLowConf = idx === 2;
      const uploadDelay = 600 + idx * 120;
      const extractDelay = uploadDelay + 1200 + idx * 80;

      timers.push(setTimeout(() => dispatch({ type: 'UPLOAD_STARTED', draftId: d.id }), 200));
      timers.push(
        setTimeout(() => {
          if (isFailureCase) {
            dispatch({
              type: 'UPLOAD_FAILED',
              draftId: d.id,
              error: { code: 'NET', message: 'Network timed out' },
            });
          } else {
            dispatch({ type: 'UPLOAD_SUCCEEDED', draftId: d.id, uploadedKey: `key-${d.id}` });
          }
        }, uploadDelay),
      );
      timers.push(
        setTimeout(() => {
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
        }, extractDelay),
      );
    });
    return () => timers.forEach(clearTimeout);
    // We intentionally only re-fire when the draft count changes — mutations
    // inside drafts shouldn't restart the simulator.
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
        <Stack.Screen options={stackScreenOptions} />
        <ScrollView contentContainerStyle={styles.empty}>
          {tripsState.kind === 'loading' ? (
            <View style={styles.loadingTrips}>
              <Skeleton width="100%" height={28} />
              <Skeleton width="80%" height={16} />
              <Skeleton width="60%" height={16} />
            </View>
          ) : tripsState.kind === 'error' ? (
            <>
              <Banner
                variant="error"
                title="Couldn't load trips"
                description={tripsState.message}
              />
              <View style={styles.emptySecondary}>
                <Button label="Retry" variant="primary" size="md" onPress={refetchTrips} />
              </View>
            </>
          ) : trips.length === 0 ? (
            <EmptyState
              illustration={<Text variant="displayXl">✈️</Text>}
              title="Create a trip first"
              description="Receipts live inside trips. Make one and you're set."
              cta={{
                label: 'Create a trip',
                onPress: () => createTripSheetRef.current?.present(),
              }}
            />
          ) : (
            <EmptyState
              illustration={<Text variant="displayXl">🧾</Text>}
              title="Nothing in the inbox yet"
              description={`Pick up to 8 receipts to start a quick capture for ${currentTrip?.name ?? ''}.`}
              cta={{ label: 'Pick receipts', onPress: handlePickReceipts }}
            />
          )}
          {tripsState.kind === 'ready' ? (
            <View style={styles.emptySecondary}>
              <Button label="Start demo batch" variant="ghost" size="sm" onPress={seedDemoBatch} />
            </View>
          ) : null}
        </ScrollView>
        <CreateTripSheet
          sheetRef={createTripSheetRef}
          form={createTripForm}
          onChange={setCreateTripForm}
          submitting={creatingTrip}
          onSubmit={async () => {
            const name = createTripForm.name.trim();
            const currency = createTripForm.currency.trim().toUpperCase();
            if (!name || !/^[A-Z]{3}$/.test(currency)) return;
            setCreatingTrip(true);
            try {
              await createTrip(() => getTokenRef.current(), {
                name,
                home_currency: currency,
              });
              createTripSheetRef.current?.dismiss();
              setCreateTripForm({ name: '', currency: 'SGD' });
              await refetchTrips();
            } catch (e) {
              Alert.alert(
                'Could not create trip',
                e instanceof Error ? e.message : 'Unknown error',
              );
            } finally {
              setCreatingTrip(false);
            }
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={stackScreenOptions} />

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
          trips={tripPickerTrips}
          initialTripId={
            tripPicker.kind === 'single_card'
              ? (state.drafts.find((d) => d.id === tripPicker.draftId)?.tripId ??
                state.defaultTripId)
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

// ─── Create-trip sheet ───────────────────────────────────────────────────

function CreateTripSheet({
  sheetRef,
  form,
  onChange,
  submitting,
  onSubmit,
}: {
  sheetRef: React.RefObject<BottomSheetHandle | null>;
  form: { name: string; currency: string };
  onChange: (next: { name: string; currency: string }) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const trimmedName = form.name.trim();
  const validCurrency = /^[A-Z]{3}$/.test(form.currency.trim().toUpperCase());
  const canSubmit = trimmedName.length > 0 && validCurrency && !submitting;
  const displayedPicks = effectiveQuickPicks(form.currency);

  const currencyPickerRef = useRef<BottomSheetHandle>(null);

  return (
    <>
      <BottomSheet ref={sheetRef} title="New trip" snapPoints={['55%']}>
        <View style={createTripStyles.body}>
          <TextInput
            label="Name"
            placeholder="Bali Apr 2026"
            value={form.name}
            onChangeText={(name) => onChange({ ...form, name })}
            autoFocus
            editable={!submitting}
          />
          <View style={createTripStyles.currencyRow}>
            <Text variant="subtitle">Settlement currency</Text>
            <View style={createTripStyles.currencyChips}>
              {displayedPicks.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={form.currency === c}
                  onPress={() => onChange({ ...form, currency: c })}
                />
              ))}
              <Chip
                label="Other"
                onPress={() => currencyPickerRef.current?.present()}
                accessibilityLabel="Pick another currency"
              />
            </View>
          </View>
          <Button
            label={submitting ? 'Creating…' : 'Create trip'}
            variant="primary"
            size="md"
            fullWidth
            disabled={!canSubmit}
            onPress={onSubmit}
          />
        </View>
      </BottomSheet>
      <CurrencyPickerSheet
        ref={currencyPickerRef}
        selectedCode={form.currency}
        title="Settlement currency"
        onSelect={(code) => {
          onChange({ ...form, currency: code });
          currencyPickerRef.current?.dismiss();
        }}
      />
    </>
  );
}

const createTripStyles = StyleSheet.create({
  body: {
    gap: Space[16],
    paddingTop: Space[8],
  },
  currencyRow: {
    gap: Space[8],
  },
  currencyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
});

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
  loadingTrips: {
    gap: Space[12],
    paddingTop: Space[24],
  },
  empty: {
    flex: 1,
    paddingHorizontal: Space[16],
    paddingTop: Space[40],
  },
  emptySecondary: {
    alignItems: 'center',
    marginTop: Space[16],
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
