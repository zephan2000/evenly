import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Neutral } from '@/constants/theme';
import { SegmentedControl, Text } from '@/components/ui';
import { type HeadlineMood, useMockFontSet } from './mockup-font-provider';

const headerOptions = [
  { label: 'Steady', value: 'steady' },
  { label: 'Breezy', value: 'breezy' },
  { label: 'Postcard', value: 'postcard' },
] as const;

export function MockupFontToggle() {
  const { headlineMood, setHeadlineMood } = useMockFontSet();

  return (
    <View style={styles.wrap}>
      <Text variant="subtitle">Headline mood</Text>
      <Text variant="caption" color="textSecondary">
        Choose how the hero phrase feels. The working UI stays in Geist for readability.
      </Text>
      <SegmentedControl<HeadlineMood>
        options={headerOptions}
        value={headlineMood}
        onChange={setHeadlineMood}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Neutral.surface,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    alignSelf: 'flex-start',
  },
});
