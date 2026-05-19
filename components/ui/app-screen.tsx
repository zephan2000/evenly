import React from 'react';
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Neutral, Rhythm } from '@/constants/theme';

export type AppScreenProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

// Web/tablet: content sits in a centered max-width column with 24px
// gutters (design-system §5.2, §7.1 editorial-poster) instead of
// stretching edge-to-edge like a scaled phone screen (UX audit P1-1).
// Mobile is unchanged (16px padding, full width).
const isWeb = Platform.OS === 'web';

export function AppScreen({ children, contentContainerStyle }: AppScreenProps) {
  const insets = useSafeAreaInsets();

  // Reserve bottom space so the last content/CTA clears the floating glass
  // tab bar (ADR 0011 / design-system §6.3). Token + live safe-area inset:
  // the pill floats `inset + 12` above the screen edge. Harmless extra
  // scroll space on screens without the tab bar (sign-in, task screens).
  const bottomClearance = Rhythm.floatingTabBarClearance + insets.bottom;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          isWeb && styles.contentWeb,
          { paddingBottom: bottomClearance },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  contentWeb: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
});
