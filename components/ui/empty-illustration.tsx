import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';

// Empty-state illustration tile (Codex UX audit item 8, P2-2).
//
// The repo has no react-native-svg infra, so the Codex-generated .svg
// illustrations can't be rendered. Per the owner's call we instead use a
// deliberately *specific* glyph from @expo/vector-icons
// (MaterialCommunityIcons — the most expressive family already shipped) so
// empty states read as intentional product art, not a generic placeholder.
//
// Visual register follows CategoryIcon: a flat brand-wash tile + a single
// brand-interactive glyph (WCAG AA on washBg). No gradient/shadow — calm,
// editorial. Decorative: EmptyState always renders a title, so this is
// accessible={false} and screen readers read only the text.

export type EmptyIllustrationProps = {
  /** MaterialCommunityIcons glyph name. Pick something specific to the
   *  empty context — not a generic box/placeholder. */
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Tile size in points. Default 72. Glyph renders at ~50%. */
  size?: number;
};

export function EmptyIllustration({ name, size = 72 }: EmptyIllustrationProps) {
  return (
    <View
      accessible={false}
      style={[styles.tile, { width: size, height: size, borderRadius: Radius.card }]}
    >
      <MaterialCommunityIcons name={name} size={Math.round(size * 0.5)} color={Brand.interactive} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: Brand.washBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
