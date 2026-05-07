import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Neutral, Radius, Rhythm, WebFocusRing } from '@/constants/theme';
import { Text } from './text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Small color dot rendered before the label (e.g., category icon color). */
  leadingDot?: string;
  /** Arbitrary leading element. Renders to the left of the label. Takes
   *  precedence over leadingDot when both are passed. */
  leading?: React.ReactNode;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  leadingDot,
  leading,
  disabled = false,
  testID,
  accessibilityLabel,
}: ChipProps) {
  const interactive = Boolean(onPress) && !disabled;

  const content = (
    <>
      {leading ? (
        <View style={styles.leading}>{leading}</View>
      ) : leadingDot ? (
        <View style={[styles.dot, { backgroundColor: leadingDot }]} />
      ) : null}
      <Text variant="chip" color={selected ? 'brandInteractive' : 'textPrimary'}>
        {label}
      </Text>
    </>
  );

  if (!interactive) {
    return (
      <View style={[styles.base, selectedStyle(selected), disabled && styles.disabled]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        styles.base,
        selectedStyle(selected),
        pressed && styles.pressed,
        focused ? webFocusStyle : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

function selectedStyle(selected: boolean): StyleProp<ViewStyle> {
  if (selected) {
    return {
      backgroundColor: Brand.washBg,
      borderColor: Brand.interactive,
    };
  }
  return {
    backgroundColor: Neutral.surface,
    borderColor: Neutral.borderSubtle,
  };
}

const webFocusStyle = {
  outline: WebFocusRing.outline,
  outlineOffset: WebFocusRing.outlineOffset,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: Rhythm.chipHeight,
    paddingHorizontal: Rhythm.chipHorizontalPadding,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  leading: {
    marginRight: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
