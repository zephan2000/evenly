import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Neutral } from '@/constants/theme';
import { Text } from './text';

export type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** When true (default), spans the available width with each segment flexed
   *  evenly. When false, segments hug their content. */
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth = true,
  testID,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View
      style={[styles.container, fullWidth && styles.containerFullWidth]}
      role="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!active) onChange(opt.value);
            }}
            role="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
              styles.segment,
              fullWidth && styles.segmentFlex,
              active && styles.segmentActive,
              pressed && !active && styles.segmentPressed,
              focused ? webFocusStyle : null,
            ]}
          >
            <Text variant="bodyStrong" color={active ? 'inverse' : 'textPrimary'} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const webFocusStyle = {
  outline: '2px solid #7C3AED',
  outlineOffset: 2,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Neutral.borderSubtle,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  containerFullWidth: {
    alignSelf: 'stretch',
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentFlex: {
    flex: 1,
  },
  segmentActive: {
    backgroundColor: Brand.interactive,
  },
  segmentPressed: {
    backgroundColor: Neutral.surface,
  },
});
