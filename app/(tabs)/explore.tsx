import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MockupFontToggle } from '@/components/mockup-font-toggle';
import { useMockFontSet } from '@/components/mockup-font-provider';
import {
  AppScreen,
  Banner,
  Button,
  Card,
  EditorialHero,
  SettingsRow,
  Text,
  TextInput,
} from '@/components/ui';
import { BrandAssets } from '@/constants/brand-assets';
import { Brand, Radius } from '@/constants/theme';
import { getMyDisplayName, updateMyDisplayName } from '@/lib/db/me';

const settingsRows = [
  'Only the hero phrase changes',
  'Balances, receipts, and lists stay in Geist',
  'This keeps readability stable while letting the brand feel more personal',
];

export default function SettingsScreen() {
  const { headlineMood } = useMockFontSet();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  // --- Your name (B6/B7): persist users.display_name + propagate to trips ---
  const [name, setName] = useState('');
  const [nameLoading, setNameLoading] = useState(true);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<{
    variant: 'success' | 'error';
    title: string;
    description?: string;
  } | null>(null);

  // Refs so the loader effect doesn't loop on Clerk's changing getToken and
  // never clobbers a name the user has started typing.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);
  const dirtyRef = useRef(false);
  const clerkSuggestion =
    user?.fullName?.trim() ||
    user?.username?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    '';
  const clerkSuggestionRef = useRef(clerkSuggestion);
  useEffect(() => {
    clerkSuggestionRef.current = clerkSuggestion;
  }, [clerkSuggestion]);

  useEffect(() => {
    if (!isSignedIn) {
      setNameLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const saved = await getMyDisplayName(() => getTokenRef.current());
        if (!active || dirtyRef.current) return;
        setName(saved ?? clerkSuggestionRef.current);
      } catch {
        if (!active || dirtyRef.current) return;
        setName(clerkSuggestionRef.current);
      } finally {
        if (active) setNameLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isSignedIn, user?.id]);

  const onSaveName = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameFeedback({
        variant: 'error',
        title: 'Enter a name',
        description: 'Your name can’t be empty.',
      });
      return;
    }
    setNameSaving(true);
    setNameFeedback(null);
    try {
      const r = await updateMyDisplayName(() => getTokenRef.current(), trimmed);
      dirtyRef.current = false;
      setName(r.display_name);
      const base =
        r.trips_updated > 0
          ? `Applied to ${r.trips_updated} trip${r.trips_updated === 1 ? '' : 's'}.`
          : 'Saved.';
      const skipNote =
        r.trips_skipped > 0
          ? ` ${r.trips_skipped} trip${r.trips_skipped === 1 ? '' : 's'} kept a different name (a member there already uses “${trimmed}”).`
          : '';
      setNameFeedback({
        variant: 'success',
        title: 'Name saved',
        description: base + skipNote,
      });
    } catch {
      setNameFeedback({
        variant: 'error',
        title: 'Couldn’t save',
        description: 'Check your connection and try again.',
      });
    } finally {
      setNameSaving(false);
    }
  }, [name]);

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

      {isSignedIn ? (
        <Card raised style={styles.profileCard}>
          <Text variant="subtitle">Your name</Text>
          <Text variant="body" color="textSecondary">
            How you appear on trips and in “Paid by”.
          </Text>
          <TextInput
            label="Display name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              dirtyRef.current = true;
            }}
            placeholder={nameLoading ? 'Loading…' : 'e.g. Zephan'}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            editable={!nameLoading && !nameSaving}
            returnKeyType="done"
            onSubmitEditing={onSaveName}
          />
          {nameFeedback ? (
            <Banner
              variant={nameFeedback.variant}
              title={nameFeedback.title}
              description={nameFeedback.description}
            />
          ) : null}
          <Button
            label="Save name"
            size="md"
            fullWidth
            loading={nameSaving}
            disabled={nameLoading || name.trim().length === 0}
            onPress={onSaveName}
          />
        </Card>
      ) : null}

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
  profileCard: {
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
