// Quick capture — tray screen (C4b), spec §5.2.
//
// Inbox-tray model: one workspace for 1-8 receipts, parsed in parallel,
// reviewed/edited in capture order. Single tray-level Save action; flagged
// review is an exception path, not the default.
//
// Production path: real expo-image-picker (lib/quick-capture/picker.ts)
// feeds the real orchestrator (upload → AI extract → save via
// /api/expenses). No demo/mock path — retries go through the real
// orchestrator primitives.

import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { DraftCard, type TripSummary } from '@/components/quick-capture/draft-card';
import {
  TripPickerSheet,
  type TripPickerResult,
} from '@/components/quick-capture/trip-picker-sheet';
import {
  CreateTripSheet,
  emptyCreateTripForm,
  type CreateTripSheetForm,
} from '@/components/trip/create-trip-sheet';
import { Banner } from '@/components/ui/banner';
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Brand, Neutral, Rhythm, Semantic, Space } from '@/constants/theme';
import type { ExtractedExpense } from '@/lib/ai/schema';
import { listTripMembers, type TripMember } from '@/lib/db/trip-members';
import { createTripWithMembers, listTrips, type TripRecord } from '@/lib/db/trips';
import { useQuickCaptureDispatch, useQuickCaptureState } from '@/lib/quick-capture/context';
import { createRealDeps } from '@/lib/quick-capture/deps';
import {
  retryExtraction,
  retrySave,
  retryUpload,
  runExtractions,
  runSaves,
  runUploads,
} from '@/lib/quick-capture/orchestrator';
import { setCurrentTripId } from '@/lib/storage/current-trip';
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

export default function QuickCaptureTrayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUris?: string; tripId?: string }>();
  const { getToken, isSignedIn } = useAuth();

  // Memoized so Stack.Screen receives a stable options reference and doesn't
  // call setOptions on every render — that pattern produces an infinite
  // commit-phase loop (React error #185) once the parent re-renders often.
  const stackScreenOptions = useMemo(() => ({ title: 'Smart Scan', headerShown: true }), []);

  const state = useQuickCaptureState();
  const dispatch = useQuickCaptureDispatch();
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [tripPicker, setTripPicker] = useState<TripPickerState>({ kind: 'closed' });
  const [pendingDisablePerReceipt, setPendingDisablePerReceipt] = useState<string | null>(null);
  const [tripsState, setTripsState] = useState<TripsState>({ kind: 'loading' });
  const [createTripForm, setCreateTripForm] = useState<CreateTripSheetForm>(() =>
    emptyCreateTripForm(),
  );
  const [creatingTrip, setCreatingTrip] = useState(false);
  // Members for the active batch trip + the chosen payer for this batch.
  // Per-receipt payer override is post-MVP — the whole batch saves with one
  // payer for now (the comment on createRealDeps below confirms this design).
  const [batchMembers, setBatchMembers] = useState<TripMember[]>([]);
  const [batchPayerId, setBatchPayerId] = useState<string | null>(null);

  const tripPickerRef = useRef<BottomSheetHandle>(null);
  const saveConfirmRef = useRef<BottomSheetHandle>(null);
  const disablePerReceiptConfirmRef = useRef<BottomSheetHandle>(null);
  const saveAllConfirmRef = useRef<BottomSheetHandle>(null);
  const createTripSheetRef = useRef<BottomSheetHandle>(null);
  const payerPickerRef = useRef<BottomSheetHandle>(null);

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
    const acc: Record<string, TripSummary> = {};
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

  // Persist the in-flight batch's trip id so the home re-focuses onto it
  // when the user returns. Without this, the home reads its own stale
  // current_trip_v1 (the trip that was selected before they entered QC)
  // and shows zero expenses even after a successful save.
  useEffect(() => {
    if (state.defaultTripId && !state.defaultTripId.startsWith('demo-')) {
      void setCurrentTripId(state.defaultTripId);
    }
  }, [state.defaultTripId]);

  // Fetch members + reset the batch payer whenever the batch's trip changes.
  // Default the payer to the owner; user can override via the header chip.
  useEffect(() => {
    const tripId = state.defaultTripId;
    if (!tripId || tripId.startsWith('demo-')) {
      setBatchMembers([]);
      setBatchPayerId(null);
      return;
    }
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    let cancelled = false;
    (async () => {
      try {
        const members = await listTripMembers(() => getTokenRef.current(), tripId);
        if (cancelled) return;
        setBatchMembers(members);
        setBatchPayerId(trip.owner_member_id);
      } catch {
        // Best-effort. If the fetch fails, the picker stays empty and the
        // owner-id fallback in createRealDeps still produces a valid save.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.defaultTripId, trips]);

  const visibleDrafts = useMemo(
    () => state.drafts.filter((d) => d.status !== 'discarded'),
    [state.drafts],
  );

  const ready = readyDraftCount(state);
  const flagged = flaggedDraftCount(state);
  const processing = processingDraftCount(state);
  const saved = savedDraftCount(state);
  const allSaved = visibleDrafts.length > 0 && isBatchTerminal(state) && saved > 0;

  // Saved expense ids → used to guide the user into splitting (the actual
  // next step) instead of dead-ending on a "saved" screen.
  const savedExpenseIds = useMemo(
    () =>
      state.drafts
        .filter((d) => d.status === 'saved' && d.expenseId)
        .map((d) => d.expenseId as string),
    [state.drafts],
  );
  const handleSplitNext = useCallback(() => {
    // One receipt → straight into the split spotlight wizard. Several →
    // the trip, where each receipt is opened and split (splits are
    // per-expense, so there's no single batch split target).
    if (savedExpenseIds.length === 1) {
      router.replace(`/expenses/${savedExpenseIds[0]}/split`);
    } else {
      router.replace('/(tabs)');
    }
  }, [savedExpenseIds, router]);

  const isRealBatch = visibleDrafts.length > 0;

  // Real orchestrator deps. Created lazily — null until we have a signed-in
  // session, a fetched trip, and a real (non-demo) batch. saveContext uses
  // the user-chosen batch payer (default = owner). createdBy stays the
  // owner since that's literally who entered the receipt; payer is what
  // gets split-attributed. Per-receipt payer override is still post-MVP.
  const realDeps = useMemo(() => {
    if (!isRealBatch) return null;
    if (!isSignedIn) return null;
    if (!state.defaultTripId) return null;
    const tripForBatch = trips.find((t) => t.id === state.defaultTripId);
    if (!tripForBatch) return null;
    const payerId = batchPayerId ?? tripForBatch.owner_member_id;
    return createRealDeps({
      getToken: () => getTokenRef.current(),
      uploadTripId: tripForBatch.id,
      saveContext: {
        tripId: tripForBatch.id,
        payerMemberId: payerId,
        createdByMemberId: tripForBatch.owner_member_id,
      },
    });
  }, [isRealBatch, isSignedIn, state.defaultTripId, trips, batchPayerId]);

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
      pathname: '/quick-capture',
      params: {
        imageUris: JSON.stringify(result.images.map((i) => i.uri)),
        tripId: currentTrip.id,
      },
    });
  }, [router, currentTrip]);

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
      router.push({ pathname: '/quick-capture/[draftId]', params: { draftId } });
    },
    [router],
  );

  // Real retries via the orchestrator (same DI as runUploads/Extractions/
  // Saves). Previously these were mocks that fabricated MOCK_EXTRACTED /
  // faked SAVE_SUCCEEDED — i.e. retrying a failed real receipt produced a
  // bogus expense or a silent no-op in production.
  const handleRetryUpload = useCallback(
    (draftId: string) => {
      if (!realDeps) return;
      const draft = state.drafts.find((d) => d.id === draftId);
      if (draft) void retryUpload(draft, dispatch, realDeps);
    },
    [state.drafts, realDeps],
  );

  const handleRetryExtraction = useCallback(
    (draftId: string) => {
      if (!realDeps) return;
      const draft = state.drafts.find((d) => d.id === draftId);
      if (draft) void retryExtraction(draft, dispatch, realDeps);
    },
    [state.drafts, realDeps],
  );

  const handleRetrySave = useCallback(
    (draftId: string) => {
      if (!realDeps) return;
      const draft = state.drafts.find((d) => d.id === draftId);
      if (draft) void retrySave(draft, dispatch, realDeps);
    },
    [state.drafts, realDeps],
  );

  const handleRePick = useCallback(
    (draftId: string) => {
      // Single-image in-place re-pick isn't built yet; discarding the draft
      // lets the user re-capture it via "Pick receipts". Honest no-data
      // behavior (no fabricated content).
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

  const performBulkSave = useCallback(() => {
    saveAllConfirmRef.current?.dismiss();
    if (!realDeps) return;
    // Orchestrator dispatches SAVE_STARTED / SAVE_SUCCEEDED / SAVE_FAILED
    // per ready+unreviewed draft and round-trips through /api/expenses
    // (createUserClient → save_expense_with_items RPC).
    void runSaves(state, dispatch, realDeps);
  }, [state, realDeps, dispatch]);

  const handleSaveReceipts = useCallback(() => {
    if (ready === 0) return;
    // The confirm sheet only earns its place when something is flagged (it
    // warns flagged receipts stay in the inbox + offers Review). With
    // nothing flagged it's pure friction — save directly.
    if (flagged === 0) {
      performBulkSave();
      return;
    }
    saveAllConfirmRef.current?.present();
  }, [ready, flagged, performBulkSave]);

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
        pathname: '/quick-capture/[draftId]',
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
        </ScrollView>
        <CreateTripSheet
          ref={createTripSheetRef}
          form={createTripForm}
          onChange={setCreateTripForm}
          submitting={creatingTrip}
          onSubmit={async () => {
            const name = createTripForm.name.trim();
            const currency = createTripForm.currency.trim().toUpperCase();
            if (!name || !/^[A-Z]{3}$/.test(currency)) return;
            setCreatingTrip(true);
            try {
              const { trip, memberErrors } = await createTripWithMembers(
                () => getTokenRef.current(),
                { name, home_currency: currency },
                createTripForm.memberNames,
              );
              // Persist immediately so home re-focuses onto the just-created trip
              // instead of falling back to trips[0] after a refetch race.
              await setCurrentTripId(trip.id);
              createTripSheetRef.current?.dismiss();
              setCreateTripForm(emptyCreateTripForm());
              await refetchTrips();
              if (memberErrors.length > 0) {
                const list = memberErrors.map((e) => e.display_name).join(', ');
                Alert.alert('Trip created, some members didn’t save', list);
              }
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
            {batchMembers.length > 0 ? (
              <Chip
                label={`Paid by ${batchMembers.find((m) => m.id === batchPayerId)?.display_name ?? '—'}`}
                onPress={() => payerPickerRef.current?.present()}
                leading={<Ionicons name="person-outline" size={14} color={Neutral.textSecondary} />}
                accessibilityLabel="Change who paid"
              />
            ) : null}
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
          description={
            savedExpenseIds.length === 1
              ? 'Next: split it among the group so everyone’s balance is right.'
              : 'Next: open each receipt on the trip to split it among the group.'
          }
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
            onViewSaved={(expenseId) => router.push(`/expenses/${expenseId}`)}
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
            label={savedExpenseIds.length === 1 ? 'Split now' : 'Review & split'}
            variant="primary"
            size="md"
            fullWidth
            onPress={handleSplitNext}
          />
          <Button
            label="Done"
            variant="ghost"
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

      {/* Batch-level "Paid by" picker. One payer for the whole batch (§5.7;
          per-receipt override is post-MVP). Defaults to the trip owner. */}
      <BottomSheet ref={payerPickerRef} title="Who paid?" snapPoints={['55%']}>
        <Text variant="body" color="textSecondary">
          Whoever fronted the bill. Splitting attributes reimbursements to them.
        </Text>
        <View style={styles.payerList}>
          {batchMembers.map((m, idx) => {
            const selected = m.id === batchPayerId;
            return (
              <ListRow
                key={m.id}
                title={m.display_name}
                subtitle={m.user_id ? 'Owner' : 'Guest'}
                onPress={() => {
                  setBatchPayerId(m.id);
                  payerPickerRef.current?.dismiss();
                }}
                separator={idx < batchMembers.length - 1}
                accessibilityLabel={`${m.display_name}${selected ? ', selected' : ''}`}
                trailing={
                  selected ? (
                    <Text variant="body" color="brandInteractive">
                      Selected
                    </Text>
                  ) : null
                }
              />
            );
          })}
        </View>
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
  payerList: {
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: Space[12],
  },
});

// Brand + Semantic are reserved for follow-on visual passes by Codex.
void Brand;
void Semantic;
