// Create-trip sheet — shared between home (zero-trips CTA + picker
// "New trip" row) and quick-capture (empty state CTA). Captures the
// minimum needed to make splitting work from day one:
//   - name
//   - settlement currency
//   - a chip-input list of additional members (Mom, Dad, friends...)
//
// On submit the parent owns the network call; this component is just
// the form. The reason: home wants to also persist current-trip-id +
// refetch its lists; QC wants to refetch its own tripsState. Both
// concerns belong on the caller, not in this primitive.

import React, { forwardRef, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CurrencyPickerSheet } from '@/components/quick-capture/currency-picker-sheet';
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Brand, Neutral, Radius, Space } from '@/constants/theme';
import { effectiveQuickPicks } from '@/lib/fx/currencies';

export type CreateTripSheetForm = {
  name: string;
  currency: string;
  memberNames: string[];
};

export type CreateTripSheetProps = {
  form: CreateTripSheetForm;
  onChange: (next: CreateTripSheetForm) => void;
  submitting: boolean;
  onSubmit: () => void;
  /** Optional title override — defaults to "New trip". */
  title?: string;
};

const NAME_RE = /^[A-Z]{3}$/;

export const CreateTripSheet = forwardRef<BottomSheetHandle, CreateTripSheetProps>(
  function CreateTripSheet({ form, onChange, submitting, onSubmit, title = 'New trip' }, ref) {
    const trimmedName = form.name.trim();
    const upperCurrency = form.currency.trim().toUpperCase();
    const validCurrency = NAME_RE.test(upperCurrency);
    const canSubmit = trimmedName.length > 0 && validCurrency && !submitting;
    const displayedPicks = effectiveQuickPicks(form.currency);

    const currencyPickerRef = useRef<BottomSheetHandle>(null);

    const [memberDraft, setMemberDraft] = useState('');

    const handleAddMember = useCallback(() => {
      const trimmed = memberDraft.trim();
      if (!trimmed) return;
      // Silently dedupe — the server would reject the duplicate anyway,
      // and showing an error for typing the same name twice feels punitive.
      const existsCaseInsensitive = form.memberNames.some(
        (n) => n.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existsCaseInsensitive) {
        setMemberDraft('');
        return;
      }
      onChange({ ...form, memberNames: [...form.memberNames, trimmed] });
      setMemberDraft('');
    }, [form, memberDraft, onChange]);

    const handleRemoveMember = useCallback(
      (name: string) => {
        onChange({
          ...form,
          memberNames: form.memberNames.filter((n) => n !== name),
        });
      },
      [form, onChange],
    );

    return (
      <>
        <BottomSheet ref={ref} title={title} snapPoints={['70%']}>
          <View style={styles.body}>
            <TextInput
              label="Name"
              placeholder="Bali Apr 2026"
              value={form.name}
              onChangeText={(name) => onChange({ ...form, name })}
              autoFocus
              editable={!submitting}
            />

            <View style={styles.section}>
              <Text variant="subtitle">Settlement currency</Text>
              <View style={styles.currencyChips}>
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

            <View style={styles.section}>
              <Text variant="subtitle">Who&apos;s on this trip?</Text>
              <Text variant="caption" color="textSecondary">
                You&apos;re already in. Add anyone else you&apos;ll be splitting with.
              </Text>
              <View style={styles.memberAddRow}>
                <View style={styles.memberAddInput}>
                  <TextInput
                    placeholder="e.g. Mom"
                    value={memberDraft}
                    onChangeText={setMemberDraft}
                    editable={!submitting}
                    returnKeyType="done"
                    onSubmitEditing={handleAddMember}
                  />
                </View>
                <Button
                  label="Add"
                  variant="secondary"
                  size="md"
                  onPress={handleAddMember}
                  disabled={memberDraft.trim().length === 0 || submitting}
                />
              </View>
              {form.memberNames.length > 0 ? (
                <View style={styles.memberChips}>
                  {form.memberNames.map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${name}`}
                      onPress={() => handleRemoveMember(name)}
                      disabled={submitting}
                      style={({ pressed }) => [
                        styles.memberChip,
                        pressed ? styles.memberChipPressed : null,
                      ]}
                    >
                      <Text variant="chip" color="textPrimary">
                        {name}
                      </Text>
                      <Text variant="chip" color="textSecondary" style={styles.memberChipX}>
                        ×
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
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
  },
);

export function emptyCreateTripForm(defaultCurrency = 'SGD'): CreateTripSheetForm {
  return { name: '', currency: defaultCurrency, memberNames: [] };
}

const styles = StyleSheet.create({
  body: {
    gap: Space[16],
    paddingTop: Space[8],
  },
  section: {
    gap: Space[8],
  },
  currencyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
  memberAddRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space[8],
  },
  memberAddInput: {
    flex: 1,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[4],
    paddingHorizontal: Space[12],
    paddingVertical: Space[8],
    borderRadius: Radius.pill,
    backgroundColor: Brand.washBg,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
  },
  memberChipPressed: {
    opacity: 0.7,
  },
  memberChipX: {
    fontSize: 14,
    lineHeight: 14,
  },
});
