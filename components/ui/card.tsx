import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Neutral, Radius, Shadow } from '@/constants/theme';

export type CardProps = {
  children: React.ReactNode;
  /** Internal padding. Defaults to 16. Pass 0 for flush layouts. */
  padding?: number;
  /** Apply Shadow.xs for subtle elevation. */
  raised?: boolean;
  /** Makes the card a Pressable. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({
  children,
  padding = 16,
  raised = false,
  onPress,
  style,
  accessibilityLabel,
}: CardProps) {
  const composed: StyleProp<ViewStyle> = [
    styles.base,
    { padding },
    raised && (Shadow.xs as ViewStyle),
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        role="button"
        accessibilityLabel={accessibilityLabel}
        style={composed}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={composed}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Neutral.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
  },
});
