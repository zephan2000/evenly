// Single step block for the spotlight wizard.
//
// Presentational. The parent (lib/ux/spotlight-wizard.tsx) decides which
// step is active, when to animate, what to render in slots, and wires the
// focus + announcement effects. This component just renders one block in
// the locked visual register: active 100% opacity + accent border + slight
// scale-up; completed 70% opacity; future 30% opacity, non-interactive.
//
// Visual tokens are intentionally working-register (neutral border, no
// brand color). Codex's editorial pass will refine the accent and shadow.

import React, { forwardRef, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Neutral, Radius, Space } from '@/constants/theme';
import type { WizardStepStatus } from '@/lib/ux/spotlight-wizard-logic';

export type WizardStepProps = {
  id: string;
  title: string;
  status: WizardStepStatus;
  /** When true, render only the `summary` slot (mobile collapse mode). */
  collapsed: boolean;
  /** Full step body — rendered when active or when not collapsed. */
  content: React.ReactNode;
  /** One-line summary rendered when collapsed and not active. */
  summary: React.ReactNode;
  /** Optional trailing affordance in the header (e.g. Edit pill). */
  trailing?: React.ReactNode;
  /** Whole-row tap target. Parent gates this via decideRevisit; this
   *  component just fires the handler when the row is pressed. */
  onActivate?: () => void;
  /** When true, the row is non-interactive (future steps, mid-save, etc). */
  disabled?: boolean;
  /** Step index + total for accessibility label context. */
  index: number;
  total: number;
};

const OPACITY_BY_STATUS: Record<WizardStepStatus, number> = {
  active: 1,
  completed: 0.7,
  future: 0.3,
};

const SCALE_BY_STATUS: Record<WizardStepStatus, number> = {
  active: 1.02,
  completed: 1,
  future: 1,
};

const TRANSITION_DURATION_MS = 200;

export const WizardStep = forwardRef<View, WizardStepProps>(function WizardStep(
  {
    id,
    title,
    status,
    collapsed,
    content,
    summary,
    trailing,
    onActivate,
    disabled = false,
    index,
    total,
  },
  ref,
) {
  const opacity = useRef(new Animated.Value(OPACITY_BY_STATUS[status])).current;
  const scale = useRef(new Animated.Value(SCALE_BY_STATUS[status])).current;

  // Animate opacity + scale whenever status changes. The locked spec
  // calls for 200ms ease-out on both. Native driver works for these two
  // properties on both web (via @react-native/web's polyfill) and native.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: OPACITY_BY_STATUS[status],
        duration: TRANSITION_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: SCALE_BY_STATUS[status],
        duration: TRANSITION_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [status, opacity, scale]);

  const isInteractive = !disabled && status !== 'future' && !!onActivate;
  const isActive = status === 'active';

  const body = (
    <Animated.View
      style={[
        styles.container,
        isActive ? styles.containerActive : null,
        { opacity, transform: [{ scale }] },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="caption" color="textSecondary" style={styles.indexLabel}>
            {`Step ${index + 1} of ${total}`}
          </Text>
          <Text variant="title" nativeID={`wizard-step-${id}-title`}>
            {title}
          </Text>
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {collapsed && !isActive ? (
        <View style={styles.summarySlot}>{summary}</View>
      ) : (
        <View style={styles.contentSlot}>{content}</View>
      )}
    </Animated.View>
  );

  // Wrap in Pressable when revisitable. Future / mid-save / non-revisitable
  // steps render as a plain View so the row isn't tab-targeted or pressable.
  // Web-specific aria props that React Native Web passes through. Typed via
  // a cast so the React Native View type doesn't reject them.
  const webAriaProps = {
    role: 'group',
    'aria-current': isActive ? 'step' : undefined,
    ...(status === 'future' ? { tabIndex: -1, 'aria-disabled': true } : null),
  } as Record<string, unknown>;

  if (isInteractive) {
    return (
      <Pressable
        ref={ref as React.Ref<View>}
        onPress={onActivate}
        accessibilityRole="button"
        accessibilityLabel={`${title}, step ${index + 1} of ${total}`}
        style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
        {...webAriaProps}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      ref={ref}
      accessibilityState={
        status === 'future' ? { disabled: true } : isActive ? { selected: true } : undefined
      }
      accessibilityLabel={`${title}, step ${index + 1} of ${total}`}
      {...webAriaProps}
    >
      {body}
    </View>
  );
});

// ─── Styles (working register; Codex re-skins) ───────────────────────────

const styles = StyleSheet.create({
  pressable: {
    // The animated transform inside the body handles scale; the outer
    // Pressable stays at scale 1 so its hit-target box is stable.
  },
  pressed: {
    // Subtle press-down feedback on revisitable rows.
    opacity: 0.9,
  },
  container: {
    backgroundColor: Neutral.surface,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: Radius.card,
    padding: Space[16],
    gap: Space[12],
  },
  containerActive: {
    // Working register: a hairline emphasis on the active border. Codex
    // will replace with the brand accent + shadow.
    borderColor: Neutral.textPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  headerLeft: {
    flex: 1,
    gap: Space[4],
  },
  indexLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trailing: {
    // Container for whatever the caller passes via trailing — typically
    // a Chip or a small button.
  },
  summarySlot: {
    // Collapsed-mode body — one line summary.
  },
  contentSlot: {
    // Full step body when active or non-collapsed.
  },
});
