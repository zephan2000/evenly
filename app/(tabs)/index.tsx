import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMockFontSet } from '@/components/mockup-font-provider';
import {
  AppScreen,
  Banner,
  BottomSheet,
  type BottomSheetHandle,
  Button,
  Card,
  CategoryIcon,
  Chip,
  EditorialHero,
  ListRow,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { BrandAssets } from '@/constants/brand-assets';
import { Brand, type CategoryKey, Neutral, Radius, Rhythm, Space } from '@/constants/theme';
import {
  type ExpenseRecord,
  formatExpenseTotal,
  listExpenses,
  sumHomeAmount,
} from '@/lib/db/expenses';
import { listTrips, type TripRecord } from '@/lib/db/trips';
import { formatMinor } from '@/lib/fx/currency';

const CURRENT_TRIP_STORAGE_KEY = 'evenly:current_trip_v1';
const VISIBLE_CATEGORY_KEYS: CategoryKey[] = [
  'meals',
  'transport',
  'lodging',
  'entertainment',
  'groceries',
  'other',
];

type ExpensesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; expenses: ExpenseRecord[] }
  | { kind: 'error'; message: string };

function paletteCategory(key: string): CategoryKey {
  return (VISIBLE_CATEGORY_KEYS as string[]).includes(key) ? (key as CategoryKey) : 'other';
}

function prettyCategory(category: string): string {
  if (!category) return 'Other';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function parseIsoDate(iso: string): { year: number; monthIndex: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  const monthIndex = Number.parseInt(m[2], 10) - 1;
  const day = Number.parseInt(m[3], 10);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  return { year, monthIndex, day };
}

function prettyExpenseDate(iso: string, currentYear: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const base = `${months[parsed.monthIndex]} ${parsed.day}`;
  return parsed.year === currentYear ? base : `${base}, ${parsed.year}`;
}

function monthYearFromExpense(expense?: ExpenseRecord): string {
  if (!expense) return 'NO EXPENSES';
  const parsed = parseIsoDate(expense.expense_date);
  if (!parsed) return 'RECENT';
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return `${months[parsed.monthIndex]} ${parsed.year}`;
}

function sortExpenses(a: ExpenseRecord, b: ExpenseRecord): number {
  const byDate = b.expense_date.localeCompare(a.expense_date);
  if (byDate !== 0) return byDate;
  return b.created_at.localeCompare(a.created_at);
}

export default function HomeScreen() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const { headlineMood } = useMockFontSet();
  const tripPickerRef = useRef<BottomSheetHandle>(null);
  const getTokenRef = useRef(getToken);
  const decorativeHeadingStyle = decorativeHeadingStyles[headlineMood];

  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [expensesState, setExpensesState] = useState<ExpensesState>({ kind: 'idle' });

  // Refs so loadTrips can read the latest selectedTripId in its error
  // fallback without listing it in its useCallback deps — otherwise every
  // setSelectedTripId would re-derive loadTrips and re-fire useFocusEffect.
  const selectedTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  const sortedExpenses = useMemo(() => {
    if (expensesState.kind !== 'ready') return [];
    return [...expensesState.expenses].sort(sortExpenses);
  }, [expensesState]);

  const recentExpenses = useMemo(() => sortedExpenses.slice(0, 5), [sortedExpenses]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const loadExpensesForTrip = useCallback(async (tripId: string | null) => {
    if (!tripId) {
      setExpensesState({ kind: 'ready', expenses: [] });
      return;
    }
    setExpensesState({ kind: 'loading' });
    try {
      const expenses = await listExpenses(() => getTokenRef.current(), tripId);
      setExpensesState({ kind: 'ready', expenses });
    } catch (e) {
      setExpensesState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load expenses',
      });
    }
  }, []);

  const loadTrips = useCallback(async (): Promise<string | null> => {
    if (!isSignedIn) {
      setTripsLoading(false);
      return null;
    }
    setTripsLoading(true);
    setTripsError(null);
    try {
      const [nextTrips, storedTripId] = await Promise.all([
        listTrips(() => getTokenRef.current()),
        AsyncStorage.getItem(CURRENT_TRIP_STORAGE_KEY),
      ]);
      setTrips(nextTrips);

      const persistedTrip = storedTripId
        ? nextTrips.find((trip) => trip.id === storedTripId)
        : undefined;
      const nextSelectedId = persistedTrip?.id ?? nextTrips[0]?.id ?? null;
      setSelectedTripId(nextSelectedId);

      if (nextSelectedId && nextSelectedId !== storedTripId) {
        await AsyncStorage.setItem(CURRENT_TRIP_STORAGE_KEY, nextSelectedId);
      } else if (!nextSelectedId) {
        await AsyncStorage.removeItem(CURRENT_TRIP_STORAGE_KEY);
      }
      return nextSelectedId;
    } catch (e) {
      setTripsError(e instanceof Error ? e.message : 'Failed to load trips');
      return selectedTripIdRef.current;
    } finally {
      setTripsLoading(false);
    }
  }, [isSignedIn]);

  // Single fetch path: load trips + their expenses whenever the screen
  // comes into focus (covers initial mount + return-from-detail/QC/manual).
  // Trip switches inside the home picker fetch directly via handleTripSelect
  // for instant feedback without waiting on a refocus event.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const nextTripId = await loadTrips();
        if (cancelled) return;
        await loadExpensesForTrip(nextTripId);
      })();
      return () => {
        cancelled = true;
      };
    }, [loadExpensesForTrip, loadTrips]),
  );

  const handleTripSelect = useCallback(
    (tripId: string) => {
      setSelectedTripId(tripId);
      void AsyncStorage.setItem(CURRENT_TRIP_STORAGE_KEY, tripId);
      void loadExpensesForTrip(tripId);
      tripPickerRef.current?.dismiss();
    },
    [loadExpensesForTrip],
  );

  const heroAmount = useMemo(() => {
    if (!selectedTrip || expensesState.kind !== 'ready' || sortedExpenses.length === 0) return '—';
    return `${selectedTrip.home_currency} ${formatMinor(
      sumHomeAmount(sortedExpenses),
      selectedTrip.home_currency,
    )}`;
  }, [expensesState.kind, selectedTrip, sortedExpenses]);

  const heroMetaLeft = tripsLoading
    ? 'LOADING'
    : selectedTrip
      ? monthYearFromExpense(sortedExpenses[0])
      : trips.length === 0
        ? 'NO TRIPS'
        : 'RECENT';
  const showHeroAmountSkeleton = tripsLoading || expensesState.kind === 'loading';
  // TODO(expenses-list): restore "View all" when /expenses exists.
  const showViewAll = false;
  const canOpenTripPicker = trips.length > 0;
  const hasTrips = trips.length > 0;
  const heroPrimaryLabel = hasTrips ? 'Add expense' : 'Create a trip';
  const heroMetaCenter =
    selectedTrip?.name ?? (hasTrips ? 'evenly' : 'create your first to start tracking');
  const heroMetaRight =
    hasTrips && trips.length > 1 ? 'switch trip' : hasTrips ? 'shared trip' : 'tap below';

  return (
    <AppScreen>
      {tripsError ? (
        <Banner variant="error" title="Couldn't load trip data" description={tripsError} />
      ) : null}

      <View style={styles.heroShell}>
        <EditorialHero
          imageSource={BrandAssets.homeHero}
          metaLeft={heroMetaLeft}
          metaCenter={heroMetaCenter}
          metaRight={heroMetaRight}
          headline={`breezy\nsplits`}
          subtitle="Keep the trip light. Let the math stay in the background."
          headlineStyle={decorativeHeadingStyle.displayXl}
          minHeight={436}
          footer={
            <View style={styles.heroFooter}>
              <View style={styles.heroAmountBlock}>
                {hasTrips ? (
                  <>
                    <Text variant="caption" style={styles.heroAmountLabel}>
                      Current trip total
                    </Text>
                    {showHeroAmountSkeleton ? (
                      <Skeleton width={210} height={38} radius={10} />
                    ) : (
                      <Text variant="display" color="inverse" tabularNums style={styles.heroAmount}>
                        {heroAmount}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text variant="subtitle" style={styles.noTripsCopy}>
                    No trips yet — create your first to start tracking.
                  </Text>
                )}
              </View>
              <View style={styles.heroActions}>
                <Button
                  label={heroPrimaryLabel}
                  size="lg"
                  onPress={() => router.push('/(tabs)/quick-capture')}
                />
                {hasTrips ? (
                  <Button
                    label="Type expense"
                    variant="secondary"
                    size="md"
                    onPress={() => router.push('/expenses/new')}
                  />
                ) : null}
              </View>
            </View>
          }
        />
        {canOpenTripPicker ? (
          <Pressable
            accessibilityLabel="Change current trip"
            role="button"
            onPress={() => tripPickerRef.current?.present()}
            style={({ pressed }) => [styles.metaHitArea, pressed && styles.metaHitAreaPressed]}
          >
            {trips.length > 1 ? (
              <View style={styles.metaAffordance}>
                <Ionicons name="chevron-down" size={15} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {hasTrips ? (
        <>
          <SectionHeader title="Settle softly" trailing={<Chip label="0 people owed" selected />} />

          <Card raised style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryMetric}>
                <Text variant="caption" color="textSecondary">
                  You paid
                </Text>
                <Text variant="title" tabularNums>
                  $0.00
                </Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text variant="caption" color="textSecondary">
                  You’re owed
                </Text>
                <Text variant="title" tabularNums style={styles.owedValue}>
                  $0.00
                </Text>
              </View>
            </View>
            <View style={styles.chipRow}>
              <Chip label="Settlement soon" leadingDot="#2457D6" />
              <Chip label="Scan first" leadingDot="#30A46C" />
              <Chip label="Auto-split" leadingDot="#F76B15" />
            </View>
          </Card>
        </>
      ) : null}

      {hasTrips ? (
        <>
          <SectionHeader
            title="Recent expenses"
            trailing={
              showViewAll ? (
                <ViewAllLink
                  onPress={() => {
                    // /expenses is intentionally not routed yet.
                  }}
                />
              ) : null
            }
          />

          <Card padding={0} raised>
            {expensesState.kind === 'loading' || tripsLoading ? (
              <RecentExpenseSkeletonRows />
            ) : expensesState.kind === 'error' ? (
              <View style={styles.emptyRecentRow}>
                <Text variant="body" color="textSecondary">
                  Could not load recent expenses.
                </Text>
              </View>
            ) : recentExpenses.length === 0 ? (
              <View style={styles.emptyRecentRow}>
                <Text variant="body" color="textSecondary">
                  No expenses yet. Tap Add expense to get started.
                </Text>
              </View>
            ) : (
              recentExpenses.map((expense, index) => (
                <ListRow
                  key={expense.id}
                  title={expense.merchant.trim() || 'Receipt'}
                  subtitle={`${prettyExpenseDate(expense.expense_date, currentYear)} · ${prettyCategory(
                    expense.category,
                  )}`}
                  leading={<CategoryIcon category={paletteCategory(expense.category)} />}
                  trailing={
                    <Text variant="bodyStrong" tabularNums>
                      {formatExpenseTotal(expense)}
                    </Text>
                  }
                  separator={index < recentExpenses.length - 1}
                  onPress={() => router.push(`/expenses/${expense.id}`)}
                  accessibilityLabel={`Open ${expense.merchant.trim() || 'receipt'} expense`}
                />
              ))
            )}
          </Card>
        </>
      ) : null}

      <Card raised style={styles.noteCard}>
        <View style={styles.noteIcon}>
          <Ionicons name="cloud-outline" size={22} color={Brand.interactive} />
        </View>
        <View style={styles.noteCopy}>
          <Text variant="subtitle">Dreamier hero, quieter workflow</Text>
          <Text variant="body" color="textSecondary">
            Imagery lives up top. The rest of the product stays calm, white, and easy to scan.
          </Text>
        </View>
      </Card>

      {hasTrips ? (
        <HomeTripPickerSheet
          ref={tripPickerRef}
          trips={trips}
          selectedTripId={selectedTripId ?? trips[0]?.id ?? ''}
          onSelectTrip={handleTripSelect}
          onCreateTrip={() => {
            tripPickerRef.current?.dismiss();
            router.push('/(tabs)/quick-capture');
          }}
        />
      ) : null}
    </AppScreen>
  );
}

const HomeTripPickerSheet = React.forwardRef<
  BottomSheetHandle,
  {
    trips: TripRecord[];
    selectedTripId: string;
    onSelectTrip: (tripId: string) => void;
    onCreateTrip: () => void;
  }
>(function HomeTripPickerSheet({ trips, selectedTripId, onSelectTrip, onCreateTrip }, ref) {
  return (
    <BottomSheet ref={ref} title="Current trip" snapPoints={['55%']}>
      <View style={styles.tripPickerList}>
        {trips.map((trip, index) => {
          const selected = trip.id === selectedTripId;
          return (
            <ListRow
              key={trip.id}
              title={trip.name}
              subtitle={trip.home_currency}
              onPress={() => onSelectTrip(trip.id)}
              trailing={
                selected ? (
                  <View style={styles.selectedDot} />
                ) : (
                  <View style={styles.selectedDotEmpty} />
                )
              }
              separator={index < trips.length - 1}
              accessibilityLabel={`${trip.name}${selected ? ', selected' : ''}`}
            />
          );
        })}
      </View>
      <Button label="Create a new trip" variant="secondary" fullWidth onPress={onCreateTrip} />
    </BottomSheet>
  );
});

function ViewAllLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="View all expenses"
      role="link"
      onPress={onPress}
      style={({ pressed }) => [styles.viewAllLink, pressed && styles.viewAllLinkPressed]}
    >
      <Text variant="body" color="brandInteractive">
        View all
      </Text>
    </Pressable>
  );
}

function RecentExpenseSkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((idx) => (
        <View key={idx} style={[styles.skeletonRow, idx < 2 ? styles.skeletonRowSeparator : null]}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={styles.skeletonCopy}>
            <Skeleton width="62%" height={18} radius={6} />
            <Skeleton width="42%" height={14} radius={6} />
          </View>
          <Skeleton width={76} height={18} radius={6} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  heroShell: {
    position: 'relative',
  },
  metaHitArea: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    height: 44,
    borderRadius: Radius.button,
    zIndex: 5,
    elevation: 5,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaHitAreaPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaAffordance: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(22,35,59,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFooter: {
    gap: 16,
  },
  heroActions: {
    gap: 10,
  },
  heroAmountBlock: {
    minHeight: 60,
    justifyContent: 'flex-end',
  },
  heroAmountLabel: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 34,
    lineHeight: 38,
  },
  noTripsCopy: {
    maxWidth: 280,
    color: 'rgba(255,255,255,0.92)',
  },
  summaryCard: {
    gap: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    gap: 16,
  },
  summaryMetric: {
    flex: 1,
    gap: 4,
  },
  owedValue: {
    color: Brand.interactive,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  viewAllLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  viewAllLinkPressed: {
    opacity: 0.65,
  },
  emptyRecentRow: {
    minHeight: Rhythm.listRowHeight,
    justifyContent: 'center',
    paddingHorizontal: Space[16],
    paddingVertical: Space[12],
  },
  skeletonRow: {
    minHeight: Rhythm.listRowHeight,
    paddingHorizontal: Space[16],
    paddingVertical: Space[12],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Rhythm.iconLabelGap,
  },
  skeletonRowSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: Neutral.borderSubtle,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  tripPickerList: {
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.interactive,
    borderWidth: 4,
    borderColor: Neutral.surface,
  },
  selectedDotEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Neutral.borderSubtle,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  noteIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Brand.washBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteCopy: {
    flex: 1,
    gap: 4,
  },
});

const decorativeHeadingStyles = {
  steady: {
    displayXl: {},
  },
  breezy: {
    displayXl: {
      fontFamily: 'PeaceSans',
      letterSpacing: -2.4,
    },
  },
  postcard: {
    displayXl: {
      fontFamily: 'Fraunces_700Bold',
      letterSpacing: -1.8,
    },
  },
} as const;
