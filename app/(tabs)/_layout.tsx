import { SignedIn, SignedOut } from '@clerk/clerk-expo';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Brand, Neutral, Radius, Shadow } from '@/constants/theme';

// Shadow.glass is {} on web (Platform.select default). Explicit soft glow so
// the floating pill still reads as lifted glass on web. Cast per the repo
// pattern — RN's ViewStyle type rejects the web `boxShadow` string.
const webGlassShadow =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 8px 28px rgba(143, 194, 255, 0.30)' } as unknown as ViewStyle)
    : null;

// ─── Floating liquid-glass tab bar (ADR 0011 / design-system §6.3) ────────
//
// Apple-style detached glass pill: BlurView intensity 70 + a
// rgba(255,255,255,0.72) tint + Shadow.glass, clipped to a pill radius.
//
// Pointer-safety is load-bearing. A `position: absolute` tab bar previously
// made every screen-bottom CTA (Save expense, Save splits, Done, Pick
// receipts) un-tappable on web because the bar intercepted pointer events
// across its full width. Mitigation: the full-width container is
// `pointerEvents="box-none"`, so the transparent margins around the pill
// pass touches THROUGH to the screen content below — only the pill is
// touchable. Tab screens (Home/Settings) reserve bottom content padding via
// AppScreen so no CTA sits under the pill.
function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.barContainer, { paddingBottom: insets.bottom + 12 }]}
    >
      <View style={[styles.pill, Shadow.glass as ViewStyle, webGlassShadow]}>
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.pillTint} />
        <View style={styles.pillRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = (options.title ?? route.name) as string;
            const isFocused = state.index === index;
            const color = isFocused ? Brand.interactive : Neutral.textSecondary;

            const onPress = () => {
              if (process.env.EXPO_OS === 'ios') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.tabButton,
                  isFocused ? styles.tabButtonActive : null,
                  pressed ? styles.tabButtonPressed : null,
                ]}
              >
                {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
                <Text variant="caption" style={[styles.tabLabel, { color }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <>
      <SignedIn>
        <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => (
                <IconSymbol size={24} name="gearshape.fill" color={color} />
              ),
            }}
          />
          {/*
            Non-tab routes (app/expenses/, app/quick-capture/,
            app/trips/) are NOT declared here. Declaring them as
            <Tabs.Screen> binds them to the Tabs navigator, which
            (a) overrides their file-based parent (root Stack) and
            (b) double-registers each route → the bundler emits two
            compiled chunks and the runtime resolves to the stale one.
            That is the ADR-0010 ghost-chunk root cause: PR #11 correctly
            removed these; PR #17 wrongly re-added them. Without these
            entries the routes are pure root-Stack children: they push
            on top of the tab bar (correctly absent on a task screen)
            and never appear in the tab strip.
          */}
        </Tabs>
      </SignedIn>
      <SignedOut>
        <Redirect href="/sign-in" />
      </SignedOut>
    </>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    // Light inner stroke — the Apple glass edge highlight.
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    // design-system §6 glass recipe: BlurView over rgba(255,255,255,0.72).
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  tabButton: {
    minWidth: 88,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.pill,
  },
  tabButtonActive: {
    backgroundColor: Brand.washBg,
  },
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontWeight: '600',
  },
});
