// Trip picker BottomSheet for Quick capture (M1.5).
//
// One component, two scopes per spec §5.7:
//   - 'batch' — opened from the tray header chip; lets the user change which
//     trip all unsaved drafts belong to, and toggles per-receipt mode.
//   - 'single_card' — opened from a per-card chip in per-receipt mode; lets
//     the user change one draft's trip in isolation.
//
// The sheet itself is purely a form. It does NOT call the reducer. It emits a
// `TripPickerResult` and the parent decides what to do — including showing
// the §5.7.3 confirm sheet when the user wants to leave per-receipt mode.

import { forwardRef, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { Brand, Neutral, Space } from '@/constants/theme';
import type { TripMode } from '@/lib/quick-capture/state';

import type { TripSummary } from './draft-card';

export type TripPickerResult =
  | { type: 'select_trip'; tripId: string }
  | { type: 'enable_per_receipt' }
  | { type: 'request_disable_per_receipt'; tripId: string };

export type TripPickerSheetProps = {
  /** 'batch' shows the "Pick per receipt" toggle; 'single_card' hides it. */
  scope: 'batch' | 'single_card';
  /** All trips eligible for selection. */
  trips: TripSummary[];
  /** Pre-selected trip id when the sheet opens. */
  initialTripId: string;
  /** Current batch trip mode. Only meaningful when scope is 'batch'. */
  currentTripMode?: TripMode;
  /**
   * Called when the user confirms a choice. Parent dispatches the appropriate
   * reducer action and decides whether to chain a confirm sheet (e.g. for
   * 'request_disable_per_receipt' per spec §5.7.3).
   */
  onResult: (result: TripPickerResult) => void;
};

export const TripPickerSheet = forwardRef<BottomSheetHandle, TripPickerSheetProps>(
  function TripPickerSheet(
    { scope, trips, initialTripId, currentTripMode = 'batch', onResult },
    ref,
  ) {
    const [selectedId, setSelectedId] = useState<string>(initialTripId);
    const [perReceiptOn, setPerReceiptOn] = useState<boolean>(currentTripMode === 'per_receipt');

    // Re-sync local state when the sheet is re-presented for a different draft
    // or when the batch mode changes underneath us.
    useEffect(() => setSelectedId(initialTripId), [initialTripId]);
    useEffect(() => setPerReceiptOn(currentTripMode === 'per_receipt'), [currentTripMode]);

    const showToggle = scope === 'batch';

    function handleConfirm() {
      // In single-card scope, only the trip selection matters.
      if (scope === 'single_card') {
        onResult({ type: 'select_trip', tripId: selectedId });
        return;
      }

      // Batch scope — interpret the form according to the toggle.
      const wasPerReceipt = currentTripMode === 'per_receipt';
      if (perReceiptOn && !wasPerReceipt) {
        // Off → On: enable per-receipt mode. Spec §5.7.3 says no confirm needed
        // because no per-card data is being overridden.
        onResult({ type: 'enable_per_receipt' });
        return;
      }
      if (!perReceiptOn && wasPerReceipt) {
        // On → Off: per-card trips would be overridden. Parent shows confirm.
        onResult({ type: 'request_disable_per_receipt', tripId: selectedId });
        return;
      }
      // No mode change — just apply the trip selection.
      onResult({ type: 'select_trip', tripId: selectedId });
    }

    const title = scope === 'batch' ? 'Save these receipts to:' : 'Save this receipt to:';
    const confirmLabel = confirmButtonLabel({
      scope,
      currentTripMode,
      perReceiptOn,
      selected: trips.find((t) => t.id === selectedId)?.name ?? '…',
    });

    return (
      <BottomSheet ref={ref} title={title} snapPoints={['65%']}>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {trips.map((t, idx) => (
            <ListRow
              key={t.id}
              title={t.name}
              onPress={() => setSelectedId(t.id)}
              trailing={
                selectedId === t.id ? (
                  <View style={styles.selectedDot} />
                ) : (
                  <View style={styles.selectedDotEmpty} />
                )
              }
              separator={idx !== trips.length - 1}
              accessibilityLabel={`${t.name}${selectedId === t.id ? ', selected' : ''}`}
            />
          ))}
        </ScrollView>

        {showToggle ? (
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text variant="bodyStrong">Pick per receipt</Text>
              <Text variant="caption" color="textSecondary">
                Assign each receipt to its own trip from the tray.
              </Text>
            </View>
            <Switch
              value={perReceiptOn}
              onValueChange={setPerReceiptOn}
              trackColor={{ false: Neutral.borderSubtle, true: Brand.interactive }}
            />
          </View>
        ) : null}

        <Button label={confirmLabel} variant="primary" fullWidth onPress={handleConfirm} />
      </BottomSheet>
    );
  },
);

function confirmButtonLabel({
  scope,
  currentTripMode,
  perReceiptOn,
  selected,
}: {
  scope: 'batch' | 'single_card';
  currentTripMode: TripMode;
  perReceiptOn: boolean;
  selected: string;
}): string {
  if (scope === 'single_card') return `Save to ${selected}`;
  const wasPerReceipt = currentTripMode === 'per_receipt';
  if (perReceiptOn && !wasPerReceipt) return 'Use per-receipt assignment';
  if (!perReceiptOn && wasPerReceipt) return `Switch to one trip — ${selected}`;
  return `Save to ${selected}`;
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 320,
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: Space[4],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[12],
    paddingVertical: Space[12],
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    borderBottomWidth: 1,
    borderBottomColor: Neutral.borderSubtle,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.interactive,
    borderWidth: 4,
    borderColor: Neutral.surface,
    boxShadow: `0 0 0 1.5px ${Brand.interactive}` as unknown as undefined,
  },
  selectedDotEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Neutral.borderSubtle,
  },
});
