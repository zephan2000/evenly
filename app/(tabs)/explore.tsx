import { useAuth, useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { MockupFontToggle } from '@/components/mockup-font-toggle';
import { useMockFontSet } from '@/components/mockup-font-provider';
import { AppScreen, Button, Card, EditorialHero, SettingsRow, Text } from '@/components/ui';
import { BrandAssets } from '@/constants/brand-assets';
import { Brand, Neutral, Radius } from '@/constants/theme';

const settingsRows = [
  'Only the hero phrase changes',
  'Balances, receipts, and lists stay in Geist',
  'This keeps readability stable while letting the brand feel more personal',
];

export default function SettingsScreen() {
  const { headlineMood } = useMockFontSet();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const welcomeMoodLabel =
    headlineMood === 'steady'
      ? 'Steady keeps the hero crisp, direct, and native to the product.'
      : headlineMood === 'breezy'
        ? 'Breezy feels lighter, rounder, and more playful.'
        : 'Postcard leans warmer, softer, and a little more nostalgic.';
  const previewStyle =
    headlineMood === 'steady'
      ? styles.previewSteady
      : headlineMood === 'breezy'
        ? styles.previewBreezy
        : styles.previewPostcard;

  return (
    <AppScreen>
      <Card raised style={styles.headerCard}>
        <Text variant="display" style={styles.settingsTitle}>
          Settings
        </Text>
        <Text variant="body" color="textSecondary">
          Keep the app readable, then personalize the emotional tone of the hero phrase.
        </Text>
      </Card>

      <MockupFontToggle />

      <EditorialHero
        imageSource={BrandAssets.settingsHero}
        metaLeft="headline preview"
        metaCenter="evenly"
        metaRight="settings"
        headline={`breezy\nsplits`}
        subtitle={welcomeMoodLabel}
        headlineStyle={previewStyle}
        minHeight={320}
      />

      <Card raised style={styles.moodCard}>
        <View style={styles.wordmarkRow}>
          <View style={styles.wordmarkBadge}>
            <Ionicons name="sparkles" size={18} color={Brand.interactive} />
          </View>
          <Text variant="subtitle">Current mood</Text>
        </View>
        <Text variant="body" color="textSecondary">
          {welcomeMoodLabel}
        </Text>
      </Card>

      <Card raised style={styles.featuresCard}>
        <Text variant="subtitle">How it works</Text>
        <View style={styles.featureList}>
          {settingsRows.map((item) => (
            <SettingsRow key={item} title={item} />
          ))}
        </View>
      </Card>

      <Card raised style={styles.authCard}>
        <Text variant="subtitle">Authentication</Text>
        <Text variant="body" color="textSecondary">
          {isSignedIn
            ? 'You are signed in. Authentication stays outside the expense surfaces.'
            : 'The sign-in screen lives as its own route so it doesn’t compete with the expense surfaces.'}
        </Text>
        {isSignedIn ? (
          <Button
            label="Sign out"
            size="md"
            fullWidth
            variant="secondary"
            onPress={() => clerk.signOut()}
          />
        ) : (
          <Link href="/sign-in" asChild>
            <Button label="Open sign-in" size="md" fullWidth />
          </Link>
        )}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    gap: 8,
  },
  settingsTitle: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -1.4,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmarkBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.washBg,
  },
  featuresCard: {
    gap: 14,
  },
  authCard: {
    gap: 12,
  },
  moodCard: {
    gap: 8,
  },
  featureList: {
    gap: 12,
  },
  previewSteady: {},
  previewBreezy: {
    fontFamily: 'PeaceSans',
    letterSpacing: -2.4,
  },
  previewPostcard: {
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -1.8,
  },
});
