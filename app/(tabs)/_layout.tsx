import { SignedIn, SignedOut } from '@clerk/clerk-expo';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <>
      <SignedIn>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
            headerShown: false,
            tabBarButton: HapticTab,
            // Inline (non-absolute) tab bar: lets the screen layout reserve
            // its 88px and prevents bottom CTAs (sticky save bars, modal
            // footers) from being intercepted by the tab bar overlay. The
            // previous absolute positioning meant every screen-bottom
            // button — Save expense, Save splits, Done, Pick receipts —
            // was un-tappable on web because the tab bar received the
            // pointer events.
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#E5E9EE',
              height: 88,
              paddingTop: 8,
              paddingBottom: 16,
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => (
                <IconSymbol size={28} name="gearshape.fill" color={color} />
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

            That's the actual root cause of the "Paid by picker never
            renders" saga: PR #11 correctly removed these; PR #17
            wrongly re-added them to tidy the tab strip and brought
            the dupe back. Decoded bundle confirmed manual entry +
            members each compiled twice while home (a real (tabs)
            child) compiled once.

            Without these entries the routes are pure root-Stack
            children: they push on top of the tab bar (which is
            correctly absent on a task screen — the iOS-native
            pattern) and never appear in the tab strip.
          */}
        </Tabs>
      </SignedIn>
      <SignedOut>
        <Redirect href="/sign-in" />
      </SignedOut>
    </>
  );
}
