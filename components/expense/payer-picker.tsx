// "Paid by" selector — rendered above the items section of the expense
// edit form. Lets the user pick which trip member fronted the bill, so
// splitting can attribute reimbursements correctly. Defaults to the
// current user (the trip owner) but every member is selectable.
//
// Presentational. Receives members + selectedMemberId, fires onChange.
// Trip-state fetching lives in the caller (manual entry / QC).

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Neutral, Space } from '@/constants/theme';
import type { TripMember } from '@/lib/db/trip-members';

export type PayerPickerProps = {
  members: readonly TripMember[];
  selectedMemberId: string | null;
  onChange: (memberId: string) => void;
  /** Disable interaction (e.g. while saving). */
  disabled?: boolean;
};

export function PayerPicker({ members, selectedMemberId, onChange, disabled }: PayerPickerProps) {
  if (members.length === 0) return null;
  return (
    <Card raised style={styles.card}>
      <View style={styles.header}>
        <Text variant="title">Paid by</Text>
        <Text variant="caption" color="textSecondary">
          Whoever fronted the bill. Splitting attributes reimbursements to them.
        </Text>
      </View>
      <View style={styles.chips}>
        {members.map((m) => (
          <Chip
            key={m.id}
            label={m.display_name}
            selected={m.id === selectedMemberId}
            onPress={disabled ? undefined : () => onChange(m.id)}
            accessibilityLabel={`Paid by ${m.display_name}${m.id === selectedMemberId ? ', selected' : ''}`}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Neutral.surface,
    gap: Space[12],
  },
  header: {
    gap: Space[4],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
});
