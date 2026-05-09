// Searchable currency picker BottomSheet.
//
// Mounted from any place that needs to fall back from a quick-pick row to
// the full ISO 4217 list. The host opens it via a ref, and gets the chosen
// code through `onSelect`. Designed for mobile keyboard ergonomics:
//
//   - BottomSheetTextInput (not our own <TextInput>) so the keyboard
//     doesn't fight gorhom's modal layout
//   - BottomSheetFlatList for inertial scroll inside the sheet
//   - Sticky search at top, list below, single tap commits + dismisses

import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Neutral, Radius, Space } from '@/constants/theme';
import { ALL_CURRENCIES, type CurrencyEntry, searchCurrencies } from '@/lib/fx/currencies';

export type CurrencyPickerSheetProps = {
  /** Currently-selected code, used to highlight the row. */
  selectedCode?: string | null;
  /** Fires with the chosen code. The sheet dismisses itself afterwards. */
  onSelect: (code: string) => void;
  /** Sheet title; defaults to 'Pick currency'. */
  title?: string;
};

export const CurrencyPickerSheet = forwardRef<BottomSheetHandle, CurrencyPickerSheetProps>(
  function CurrencyPickerSheet({ selectedCode, onSelect, title = 'Pick currency' }, ref) {
    const [query, setQuery] = useState('');

    const results = useMemo<readonly CurrencyEntry[]>(
      () => (query ? searchCurrencies(query) : ALL_CURRENCIES),
      [query],
    );

    // Accessing the ref's dismiss requires the consumer's ref. We forward
    // ref so consumers control dismissal via their own ref.current?.dismiss.
    const handleSelect = useCallback(
      (code: string) => {
        onSelect(code);
        setQuery('');
      },
      [onSelect],
    );

    const renderItem = useCallback(
      ({ item }: { item: CurrencyEntry }) => {
        const isSelected = item.code === selectedCode;
        return (
          <Pressable
            onPress={() => handleSelect(item.code)}
            style={({ pressed }) => [
              styles.row,
              isSelected ? styles.rowSelected : null,
              pressed ? styles.rowPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.code}, ${item.name}`}
            accessibilityState={{ selected: isSelected }}
          >
            <Text variant="bodyStrong" style={styles.code}>
              {item.code}
            </Text>
            <Text variant="body" color="textSecondary" numberOfLines={1} style={styles.name}>
              {item.name}
            </Text>
          </Pressable>
        );
      },
      [handleSelect, selectedCode],
    );

    return (
      <BottomSheet ref={ref} title={title} snapPoints={['85%']}>
        <View style={styles.searchWrap}>
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search code or name"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.search}
            placeholderTextColor={Neutral.textSecondary}
          />
        </View>
        <BottomSheetFlatList
          data={results as CurrencyEntry[]}
          keyExtractor={(item) => item.code}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" color="textSecondary">
                {`No currencies match "${query}".`}
              </Text>
            </View>
          }
        />
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  searchWrap: {
    paddingBottom: Space[12],
  },
  search: {
    backgroundColor: Neutral.canvas,
    borderRadius: Radius.input,
    paddingHorizontal: Space[12],
    paddingVertical: Space[12],
    fontSize: 16,
    color: Neutral.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space[12],
    paddingHorizontal: Space[8],
    gap: Space[12],
    borderBottomWidth: 1,
    borderBottomColor: Neutral.borderSubtle,
  },
  rowSelected: {
    backgroundColor: Neutral.canvas,
  },
  rowPressed: {
    opacity: 0.6,
  },
  code: {
    minWidth: 56,
  },
  name: {
    flex: 1,
  },
  empty: {
    paddingVertical: Space[24],
    alignItems: 'center',
  },
});
