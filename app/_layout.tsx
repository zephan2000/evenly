import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import { Fraunces_700Bold, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { GeistMono_700Bold } from '@expo-google-fonts/geist-mono';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { MockFontSetProvider } from '@/components/mockup-font-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep the splash visible until fonts are loaded so we never show
// fallback-font flash of unstyled text. expo-splash-screen guards this.
SplashScreen.preventAutoHideAsync().catch(() => {
  // already hidden in some HMR cases — safe to ignore
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PeaceSans: require('../assets/fonts/peace-sans/Peace Sans Webfont.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (!publishableKey) {
    throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <MockFontSetProvider>
          <BottomSheetModalProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                {/* Task-oriented screens (quick-capture/, expenses/, trips/)
                    are auto-discovered by expo-router from the file system.
                    We deliberately do NOT declare them here as Stack.Screen
                    entries — doing so caused expo-router to register them
                    twice (once auto-discovered, once explicit) and the
                    bundler emitted two compiled copies. The second copy
                    was stale source (pre-PR#5) that the router then
                    resolved to at runtime. Each screen file owns its own
                    header via its own <Stack.Screen options> child. */}
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </BottomSheetModalProvider>
        </MockFontSetProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
