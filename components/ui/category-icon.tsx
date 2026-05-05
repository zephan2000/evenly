import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Category, type CategoryKey } from '@/constants/theme';

const ICON_MAP: Record<CategoryKey, keyof typeof Ionicons.glyphMap> = {
  meals: 'restaurant',
  transport: 'car',
  lodging: 'bed',
  entertainment: 'musical-notes',
  groceries: 'basket',
  other: 'pricetag',
};

export type CategoryIconProps = {
  category: CategoryKey;
  /** Container size. Default 40pt. Glyph renders at ~50% of container. */
  size?: number;
};

/**
 * Flat tint tile + dark glyph per design-system §6.4 (Codex finding #8).
 * No gradient, no inner highlight, no shadow — sculpted variants are a
 * post-MVP polish pass.
 *
 * Decorative when paired with a text label (color independence per
 * docs/ux-principles.md). Marked accessible={false} so screen readers
 * read only the sibling label.
 */
export function CategoryIcon({ category, size = 40 }: CategoryIconProps) {
  const palette = Category[category];
  const iconName = ICON_MAP[category];

  return (
    <View
      accessible={false}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: palette.tint,
        },
      ]}
    >
      <Ionicons name={iconName} size={Math.round(size * 0.5)} color={palette.glyph} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
