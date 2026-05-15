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
            app/trips/. With output:'single' (PR #16), expo-router's
            <Tabs> auto-discovers them as siblings and renders them in
            the tab strip. href:null keeps each route reachable via
            router.push but hides its tab button.

            Earlier worry (PR #11) was that explicit declarations here
            cause double module registration. Empirically that wasn't
            the dupe source (we found phantom (tabs)/ prefixes in
            output:'server' mode were the real cause). In single mode
            with the API routes migrated out, double-registration
            doesn't occur — we need these entries purely to keep the
            tab strip clean.
          */}
          <Tabs.Screen name="quick-capture" options={{ href: null }} />
          <Tabs.Screen name="expenses/[id]" options={{ href: null }} />
          <Tabs.Screen name="expenses/[id]/split" options={{ href: null }} />
          <Tabs.Screen name="expenses/new" options={{ href: null }} />
          <Tabs.Screen name="trips/[id]/members" options={{ href: null }} />
        </Tabs>
      </SignedIn>
      <SignedOut>
        <Redirect href="/sign-in" />
      </SignedOut>
    </>
  );
}
