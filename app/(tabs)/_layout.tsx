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
            Non-tab routes live at app/expenses/, app/quick-capture/,
            app/trips/ — they push onto the root Stack via app/_layout.tsx.
            We deliberately do NOT declare them here as Tabs.Screen
            entries: doing so makes expo-router register the same route
            under two parents (root Stack + (tabs) Tabs), and the
            bundler ends up emitting the route's module twice. The
            tabs-side resolver renders the wrong (stale) chunk on
            navigation. See the PR #5/#7/#8 saga.
          */}
        </Tabs>
      </SignedIn>
      <SignedOut>
        <Redirect href="/sign-in" />
      </SignedOut>
    </>
  );
}
