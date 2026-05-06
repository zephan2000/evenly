import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Neutral, Semantic, WebFocusRing } from '@/constants/theme';

import { Text } from './text';

export type DotState = 'saved' | 'current' | 'untouched' | 'flagged' | 'failed';

export type DotItem = {
  id: string;
  state: DotState;
  /** Optional accessibility hint per dot (e.g. merchant name). Falls back to state label. */
  label?: string;
};

export type DotRowProps = {
  items: DotItem[];
  /** Caption rendered below the dots (e.g. "Receipt 2 of 6 — Hawker Heaven"). */
  caption?: string;
  /** Tap handler. If omitted, dots render as static indicators. */
  onSelect?: (id: string) => void;
  /** Accessibility label for the whole row. Defaults to the caption when omitted. */
  accessibilityLabel?: string;
  testID?: string;
};

const DOT_SIZE = 10;
const TAP_TARGET = 32;

const STATE_LABEL: Record<DotState, string> = {
  saved: 'saved',
  current: 'current',
  untouched: 'not yet reviewed',
  flagged: 'needs review',
  failed: 'failed',
};

/**
 * Compact progress indicator. Used in C5 batch-mode (Quick capture) to show
 * draft order + per-draft status, and reusable in any wizard-style flow.
 *
 * Visual rules per docs/specs/quick-capture.md §5.3:
 *   ✓ saved / ● current / ○ untouched / ⚠ flagged / × failed
 */
export function DotRow({ items, caption, onSelect, accessibilityLabel, testID }: DotRowProps) {
  const interactive = Boolean(onSelect);

  return (
    <View
      style={styles.wrapper}
      accessibilityRole={interactive ? undefined : 'progressbar'}
      accessibilityLabel={accessibilityLabel ?? caption}
      testID={testID}
    >
      <View style={styles.row}>
        {items.map((item) => (
          <DotCell
            key={item.id}
            item={item}
            interactive={interactive}
            onPress={onSelect ? () => onSelect(item.id) : undefined}
          />
        ))}
      </View>
      {caption ? (
        <Text variant="caption" color="textSecondary" style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function DotCell({
  item,
  interactive,
  onPress,
}: {
  item: DotItem;
  interactive: boolean;
  onPress?: () => void;
}) {
  const dotStyle = dotStyleFor(item.state);
  const a11yLabel = item.label
    ? `${item.label}, ${STATE_LABEL[item.state]}`
    : STATE_LABEL[item.state];

  if (!interactive || !onPress) {
    return (
      <View style={styles.cell} accessibilityLabel={a11yLabel}>
        <View style={[styles.dot, dotStyle]}>{glyphFor(item.state)}</View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      accessibilityLabel={a11yLabel}
      hitSlop={8}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        styles.cell,
        pressed && styles.cellPressed,
        focused ? webFocusStyle : null,
      ]}
    >
      <View style={[styles.dot, dotStyle]}>{glyphFor(item.state)}</View>
    </Pressable>
  );
}

function dotStyleFor(state: DotState): StyleProp<ViewStyle> {
  switch (state) {
    case 'saved':
      return { backgroundColor: Semantic.success.fg, borderColor: Semantic.success.fg };
    case 'current':
      return { backgroundColor: Brand.interactive, borderColor: Brand.interactive };
    case 'flagged':
      return { backgroundColor: Semantic.warning.fg, borderColor: Semantic.warning.fg };
    case 'failed':
      return { backgroundColor: Semantic.error.fg, borderColor: Semantic.error.fg };
    case 'untouched':
    default:
      return { backgroundColor: 'transparent', borderColor: Neutral.borderSubtle };
  }
}

function glyphFor(state: DotState): React.ReactNode {
  // Saved + failed wear glyphs to distinguish from solid color blobs at a glance.
  // Per a11y, the spoken label still carries the meaning; glyphs are belt-and-braces.
  if (state === 'saved') return <View style={styles.checkInner} />;
  if (state === 'failed') return <View style={styles.crossInner} />;
  return null;
}

const webFocusStyle = {
  outline: WebFocusRing.outline,
  outlineOffset: WebFocusRing.outlineOffset,
  borderRadius: TAP_TARGET / 2,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cell: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPressed: {
    opacity: 0.6,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    marginLeft: 2,
  },
  // Inner glyphs are subtle dots/lines inside the colored disc; full check/×
  // marks belong on larger surfaces (ListRow, etc).
  checkInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Neutral.surface,
  },
  crossInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Neutral.surface,
  },
});
