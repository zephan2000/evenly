import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Neutral, Space } from '@/constants/theme';
import { Text } from './text';

export type ScreenHeaderProps = {
  /** Large in-page title — the screen's real heading. */
  title: string;
  /** Optional one-line context under the title (e.g. "Merchant · date"). */
  subtitle?: string;
  /** Back handler. When omitted, no back control renders (root-ish screens). */
  onBack?: () => void;
  /** A11y label for the back control. Default "Back". */
  backAccessibilityLabel?: string;
};

// Modern screen header (replaces the default React Navigation bar).
//
// The native Stack header carved out a persistent system strip + back
// chevron on top of screens that already render a big in-page title — an
// ugly double header. Instead each screen hides the native header and
// renders this: a minimal, chrome-less back chevron sitting just above the
// large title, with the top safe-area inset the native bar used to cover.
// No persistent box, no duplicated title — the title IS the header.
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel = 'Back',
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Space[8] }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}
          hitSlop={10}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backPressed : null]}
        >
          <Ionicons name="chevron-back" size={26} color={Neutral.textPrimary} />
        </Pressable>
      ) : null}
      <Text variant="display">{title}</Text>
      {subtitle ? (
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space[4],
  },
  backButton: {
    // Chrome-less: no background/border. Negative left margin so the glyph
    // optically aligns with the title's leading edge while keeping a
    // comfortable tap target via width + hitSlop.
    width: 40,
    height: 40,
    marginLeft: -8,
    marginBottom: Space[4],
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backPressed: {
    opacity: 0.55,
  },
});
