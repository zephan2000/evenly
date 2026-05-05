import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Semantic } from '@/constants/theme';
import { Text, type TextColorToken } from './text';

export type BannerVariant = 'info' | 'success' | 'warning' | 'error';

const iconMap: Record<BannerVariant, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
  error: 'alert-circle',
};

const colorMap: Record<BannerVariant, TextColorToken> = {
  info: 'infoFg',
  success: 'successFg',
  warning: 'warningFg',
  error: 'errorFg',
};

export type BannerProps = {
  variant: BannerVariant;
  /** Optional bold lead-in. */
  title?: string;
  /** Body of the banner. */
  description?: string;
  /** Slot for a CTA (Button, link, etc.). */
  children?: React.ReactNode;
};

export function Banner({ variant, title, description, children }: BannerProps) {
  const palette = Semantic[variant];
  const colorToken = colorMap[variant];

  return (
    <View style={[styles.base, { backgroundColor: palette.bg }]} role="alert">
      <Ionicons name={iconMap[variant]} size={20} color={palette.fg} style={styles.icon} />
      <View style={styles.content}>
        {title && (
          <Text variant="bodyStrong" color={colorToken}>
            {title}
          </Text>
        )}
        {description && (
          <Text variant="body" color={colorToken}>
            {description}
          </Text>
        )}
        {children ? <View style={styles.childSlot}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
  },
  icon: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  childSlot: {
    marginTop: 8,
  },
});
