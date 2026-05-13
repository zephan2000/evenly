// Trip members management screen.
//
// Reachable from the home trip picker. Lists every member on the trip
// and lets the owner add new ones (anonymous — no Clerk account, no
// invite link). Add-only for MVP: rename / remove / re-anonymize are
// post-MVP since they touch existing expense splits.

import { useAuth } from '@clerk/clerk-expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/ui/app-screen';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Brand, Neutral, Space } from '@/constants/theme';
import { addTripMember, listTripMembers, type TripMember } from '@/lib/db/trip-members';
import { listTrips, type TripRecord } from '@/lib/db/trips';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; trip: TripRecord; members: TripMember[] }
  | { kind: 'error'; message: string };

export default function TripMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = typeof params.id === 'string' && UUID_RE.test(params.id) ? params.id : undefined;
  const { getToken, isSignedIn } = useAuth();

  const stackOptions = useMemo(
    () => ({ title: 'Trip members', headerShown: true, headerBackTitle: 'Back' }),
    [],
  );

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    if (!tripId) {
      setLoad({ kind: 'error', message: 'Missing trip id.' });
      return;
    }
    setLoad({ kind: 'loading' });
    try {
      const [trips, members] = await Promise.all([
        listTrips(() => getTokenRef.current()),
        listTripMembers(() => getTokenRef.current(), tripId),
      ]);
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) {
        setLoad({ kind: 'error', message: 'Trip not found.' });
        return;
      }
      setLoad({ kind: 'ready', trip, members });
    } catch (e) {
      setLoad({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load',
      });
    }
  }, [tripId]);

  useEffect(() => {
    if (!isSignedIn) return;
    void refresh();
  }, [isSignedIn, refresh]);

  const handleAdd = useCallback(async () => {
    if (load.kind !== 'ready' || !tripId) return;
    const display_name = draft.trim();
    if (!display_name || adding) return;
    const existing = load.members.some(
      (m) => m.display_name.toLowerCase() === display_name.toLowerCase(),
    );
    if (existing) {
      Alert.alert('Already added', `${display_name} is already on this trip.`);
      return;
    }
    setAdding(true);
    try {
      const member = await addTripMember(() => getTokenRef.current(), tripId, { display_name });
      setLoad({ ...load, members: [...load.members, member] });
      setDraft('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Could not add member', msg);
    } finally {
      setAdding(false);
    }
  }, [adding, draft, load, tripId]);

  if (load.kind === 'loading') {
    return (
      <AppScreen>
        <Stack.Screen options={stackOptions} />
        <Skeleton width="50%" height={28} />
        <Skeleton fullWidth height={120} radius={16} />
        <Skeleton fullWidth height={80} radius={16} />
      </AppScreen>
    );
  }

  if (load.kind === 'error') {
    return (
      <AppScreen>
        <Stack.Screen options={stackOptions} />
        <Banner variant="error" title="Couldn’t load members" description={load.message} />
        <Button label="Back" variant="primary" size="md" onPress={() => router.back()} />
      </AppScreen>
    );
  }

  const { trip, members } = load;

  return (
    <AppScreen>
      <Stack.Screen options={stackOptions} />

      <View style={styles.header}>
        <Text variant="title">{trip.name}</Text>
        <Text variant="caption" color="textSecondary">
          {members.length} {members.length === 1 ? 'member' : 'members'} · {trip.home_currency}
        </Text>
      </View>

      <Card padding={0} raised>
        {members.map((m, index) => (
          <ListRow
            key={m.id}
            title={m.display_name}
            subtitle={m.user_id ? 'Owner' : 'Guest'}
            separator={index < members.length - 1}
            accessibilityLabel={m.display_name}
          />
        ))}
      </Card>

      <Card raised style={styles.addCard}>
        <Text variant="subtitle">Add a member</Text>
        <Text variant="caption" color="textSecondary">
          Add anyone you’ll be splitting with. No account required.
        </Text>
        <View style={styles.addRow}>
          <View style={styles.addInput}>
            <TextInput
              placeholder="e.g. Dad"
              value={draft}
              onChangeText={setDraft}
              editable={!adding}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
          </View>
          <Button
            label={adding ? 'Adding…' : 'Add'}
            variant="primary"
            size="md"
            onPress={handleAdd}
            disabled={draft.trim().length === 0 || adding}
          />
        </View>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Space[4],
  },
  addCard: {
    gap: Space[12],
    borderColor: Brand.washBg,
    backgroundColor: Neutral.surface,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space[8],
  },
  addInput: {
    flex: 1,
  },
});
