import React from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Neutral } from '@/constants/theme';

export type AppScreenProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function AppScreen({ children, contentContainerStyle }: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, contentContainerStyle]}
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
    paddingBottom: 120,
    gap: 20,
  },
});
