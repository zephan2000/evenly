import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Neutral, Rhythm, WebFocusRing } from '@/constants/theme';
import { Text } from './text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Leading element (CategoryIcon, Avatar, etc.). */
  leading?: React.ReactNode;
  /** Trailing element. Typically an amount Text with `tabularNums`, or a
   *  chevron icon for nav rows. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Render a hairline separator on the bottom edge. Default true. */
  separator?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  separator = true,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const Inner = (
    <View style={styles.inner}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.content}>
        <Text variant="subtitle" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    separator && styles.containerSeparator,
  ];

  if (!onPress) {
    return (
      <View style={containerStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
        {Inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        containerStyle,
        pressed && styles.pressed,
        focused ? webFocusStyle : null,
      ]}
    >
      {Inner}
    </Pressable>
  );
}

const webFocusStyle = {
  outline: WebFocusRing.outline,
  outlineOffset: WebFocusRing.outlineOffset,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  container: {
    minHeight: Rhythm.listRowHeight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Neutral.surface,
    justifyContent: 'center',
  },
  containerSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: Neutral.borderSubtle,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Rhythm.iconLabelGap,
  },
  leading: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  trailing: {
    flexShrink: 0,
    marginLeft: 8,
  },
  pressed: {
    backgroundColor: Neutral.canvas,
  },
});
