// Manual expense entry (Tricount-style typed entry, no receipt).
//
// Reached from a "Manual entry" affordance on home (Codex's lane) or
// from /quick-capture's empty state. Reads the current trip via the
// shared lib/storage/current-trip helper, fetches the trip to resolve
// home_currency + owner_member_id, then mounts the existing
// ExpenseEditForm with empty defaults.
//
// On save, POSTs to /api/expenses with receipt_image_path=null. The
// server schema accepts that; the DB column is nullable.

import { useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ExpenseEditForm } from '@/components/expense/expense-edit-form';
import { PayerPicker } from '@/components/expense/payer-picker';
import { CurrencyPickerSheet } from '@/components/quick-capture/currency-picker-sheet';
import { Banner } from '@/components/ui/banner';
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Neutral, Space } from '@/constants/theme';
import { type ExtractedExpense, type PersistedExpense } from '@/lib/ai/schema';
import { saveManualExpense } from '@/lib/db/expenses';
import { listTripMembers, type TripMember } from '@/lib/db/trip-members';
import { listTrips, type TripRecord } from '@/lib/db/trips';
import { getCurrentTripId, setCurrentTripId } from '@/lib/storage/current-trip';

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyExpense(currency: string): ExtractedExpense {
  return {
    merchant: '',
    expense_date: todayIso(),
    currency,
    tax_mode: 'exclusive',
    tax_label: '',
    items: [],
    subtotal_cents: 0,
    service_charge_cents: 0,
    tip_cents: 0,
    tax_amount_cents: 0,
    total_cents: 0,
    category_guess: 'other',
    confidence: { overall: 1, items: 1, totals: 1 },
    notes: '',
  };
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no_trips' }
  | { kind: 'ready'; trip: TripRecord; members: TripMember[] }
  | { kind: 'error'; message: string };

export default function ManualExpenseEntryScreen() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();

  const stackScreenOptions = useMemo(
    () => ({ title: 'New expense', headerShown: true, headerBackTitle: 'Back' }),
    [],
  );

  // Stable getToken so the effect doesn't loop.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [form, setForm] = useState<ExtractedExpense | null>(null);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currencyPickerRef = useRef<BottomSheetHandle>(null);

  // Resolve current trip on mount.
  useEffect(() => {
    console.log('[manual-entry] effect fired, isSignedIn=', isSignedIn);
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        console.log('[manual-entry] step 1: fetching trips + storedId');
        const [trips, storedId] = await Promise.all([
          listTrips(() => getTokenRef.current()),
          getCurrentTripId(),
        ]);
        console.log('[manual-entry] step 2: trips=', trips.length, 'storedId=', storedId);
        if (cancelled) return;
        if (trips.length === 0) {
          setLoad({ kind: 'no_trips' });
          return;
        }
        const picked = trips.find((t) => t.id === storedId) ?? trips[0];
        console.log('[manual-entry] step 3: picked trip', picked.id);
        // Fetch trip members so the payer picker has something to render.
        // We do this AFTER trip resolution so the request is scoped to the
        // visible trip; switching trips on home is rare enough that we
        // don't pre-warm.
        const members = await listTripMembers(() => getTokenRef.current(), picked.id);
        console.log('[manual-entry] step 4: members fetched, count=', members.length);
        if (cancelled) return;
        setLoad({ kind: 'ready', trip: picked, members });
        setForm(emptyExpense(picked.home_currency));
        setSelectedPayerId(picked.owner_member_id);
        console.log('[manual-entry] step 5: setLoad ready done');
      } catch (e) {
        console.log('[manual-entry] caught error', e);
        if (cancelled) return;
        setLoad({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to load trip',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const handleChange = useCallback((patch: Partial<ExtractedExpense>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (load.kind !== 'ready' || !form) return;
    if (saving) return;
    setSaving(true);
    try {
      // Collapse tax_mode 'none' → 'exclusive' to satisfy the persisted
      // schema, mirroring lib/quick-capture/deps.ts saveExpense.
      const persistedTaxMode: PersistedExpense['tax_mode'] =
        form.tax_mode === 'none' ? 'exclusive' : form.tax_mode;
      const expense: PersistedExpense = { ...form, tax_mode: persistedTaxMode };

      const expenseId = await saveManualExpense(() => getTokenRef.current(), {
        tripId: load.trip.id,
        payerMemberId: selectedPayerId ?? load.trip.owner_member_id,
        createdByMemberId: load.trip.owner_member_id,
        expense,
      });
      // Persist so the home re-focuses onto the trip we just wrote to
      // (vs. whatever was the last picker selection on home).
      await setCurrentTripId(load.trip.id);
      router.replace(`/expenses/${expenseId}`);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
    }
  }, [load, form, saving, selectedPayerId, router]);

  if (load.kind === 'loading') {
    return (
      <View style={styles.fallback}>
        <Stack.Screen options={stackScreenOptions} />
        <Skeleton width="60%" height={28} />
        <Skeleton fullWidth height={120} radius={16} />
        <Skeleton fullWidth height={200} radius={16} />
      </View>
    );
  }

  if (load.kind === 'no_trips') {
    return (
      <View style={styles.fallback}>
        <Stack.Screen options={stackScreenOptions} />
        <Banner
          variant="info"
          title="Create a trip first"
          description="Expenses live inside trips. Head back and create one."
        />
        <Button
          label="Go to Quick capture"
          variant="primary"
          size="md"
          onPress={() => router.replace('/quick-capture')}
        />
      </View>
    );
  }

  if (load.kind === 'error') {
    return (
      <View style={styles.fallback}>
        <Stack.Screen options={stackScreenOptions} />
        <Banner variant="error" title="Couldn't load" description={load.message} />
        <Button
          label="Back to home"
          variant="primary"
          size="md"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    );
  }

  if (!form) return null;

  return (
    <>
      <Stack.Screen options={stackScreenOptions} />
      <ExpenseEditForm
        value={form}
        onChange={handleChange}
        primaryActionLabel="Save expense"
        onPrimaryAction={handleSave}
        primaryActionPending={saving}
        onChangeCurrency={() => currencyPickerRef.current?.present()}
        payerSection={
          <PayerPicker
            members={load.members}
            selectedMemberId={selectedPayerId}
            onChange={setSelectedPayerId}
            disabled={saving}
          />
        }
      />
      <CurrencyPickerSheet
        ref={currencyPickerRef}
        selectedCode={form.currency}
        title="Receipt currency"
        onSelect={(code) => {
          handleChange({ currency: code });
          currencyPickerRef.current?.dismiss();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: Neutral.canvas,
    padding: Space[16],
    gap: Space[16],
  },
});
