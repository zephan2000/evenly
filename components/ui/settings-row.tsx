import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Neutral, WebFocusRing } from '@/constants/theme';
import { Text } from './text';

export type SettingsRowProps = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
};

export function SettingsRow({
  title,
  subtitle,
  trailing,
  onPress,
  showChevron = false,
}: SettingsRowProps) {
  const content = (
    <View style={styles.inner}>
      <View style={styles.copy}>
        <Text variant="subtitle">{title}</Text>
        {subtitle ? (
          <Text variant="body" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={Neutral.textSecondary} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.base}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        styles.base,
        pressed && styles.pressed,
        focused ? webFocusStyle : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const webFocusStyle = {
  outline: WebFocusRing.outline,
  outlineOffset: WebFocusRing.outlineOffset,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Neutral.surface,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: 16,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.92,
  },
});
