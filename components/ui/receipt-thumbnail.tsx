import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Neutral, Radius } from '@/constants/theme';
import { Text } from './text';

type Source = ImageSource | string | number | null | undefined;

export type ReceiptThumbnailProps = {
  /** Image source (URI, expo-image ImageSource, require'd asset, or null
   *  to render the fallback). */
  source?: Source;
  /** Tile size in points. Default 56 per design-system §7. */
  size?: number;
  /** Optional caption rendered below the tile (e.g. filename + date). */
  caption?: string;
  /** Tap handler — open full-screen preview, etc. */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * 56pt thumbnail tile per design-system §7 + Codex finding #14
 * (was a Chip; corrected to thumbnail metaphor).
 */
export function ReceiptThumbnail({
  source,
  size = 56,
  caption,
  onPress,
  accessibilityLabel,
  testID,
}: ReceiptThumbnailProps) {
  const tile = (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
        },
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={styles.image}
          contentFit="cover"
          transition={120}
          accessible={false}
        />
      ) : (
        <View style={styles.fallback}>
          <Ionicons
            name="receipt-outline"
            size={Math.round(size * 0.45)}
            color={Neutral.textDisabled}
          />
        </View>
      )}
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = caption ? styles.wrap : undefined;
  const accessibility = accessibilityLabel ?? (caption ? `Receipt: ${caption}` : 'Receipt');

  if (!onPress) {
    return (
      <View style={containerStyle} testID={testID}>
        {tile}
        {caption ? (
          <Text variant="caption" color="textSecondary" style={styles.caption}>
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      accessibilityLabel={accessibility}
      testID={testID}
      style={({ focused }: { pressed: boolean; focused?: boolean }) => [
        containerStyle,
        focused ? webFocusStyle : null,
      ]}
    >
      {tile}
      {caption ? (
        <Text variant="caption" color="textSecondary" style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const webFocusStyle = {
  // Brand.interactive (#2457D6) — design-system §3 is blue; was a stale
  // purple #7C3AED from the pre-rebrand palette (UX audit 2026-05-19).
  outline: `2px solid ${Brand.interactive}`,
  outlineOffset: 2,
  borderRadius: Radius.thumbnail,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
    gap: 6,
  },
  tile: {
    borderRadius: Radius.thumbnail,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    overflow: 'hidden',
    backgroundColor: Neutral.canvas,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    marginLeft: 2,
  },
});
