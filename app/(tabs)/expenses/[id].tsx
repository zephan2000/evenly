// C6 — Saved expense detail (read-only).
//
// Reached after a successful save (post-MVP wiring) and from the
// upcoming home Recent expenses list. Confirms the saved record and
// is the planned entry point for M2 splitting via the Split CTA.
//
// Read-only by design — edits go through C5 (a future Edit button on
// this screen will navigate there). Delete with undo lands in Chunk 4.

import { useAuth } from '@clerk/clerk-expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Chip } from '@/components/ui/chip';
import { ReceiptThumbnail } from '@/components/ui/receipt-thumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Brand, type CategoryKey, Neutral, Radius, Space } from '@/constants/theme';
import { type ExpenseDetail, type ExpenseRecord, getExpense } from '@/lib/db/expenses';
import { formatMinor } from '@/lib/fx/currency';

const VISIBLE_CATEGORY_KEYS: CategoryKey[] = [
  'meals',
  'transport',
  'lodging',
  'entertainment',
  'groceries',
  'other',
];

function paletteCategory(key: string): CategoryKey {
  return (VISIBLE_CATEGORY_KEYS as string[]).includes(key) ? (key as CategoryKey) : 'other';
}

function prettyCategory(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function formatDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (monthIdx < 0 || monthIdx >= 12) return iso;
  return `${months[monthIdx]} ${day}, ${m[1]}`;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ExpenseDetail }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractIdFromPathname(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const segments = window.location.pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('expenses');
  if (idx < 0) return undefined;
  const candidate = segments[idx + 1];
  return candidate && UUID_RE.test(candidate) ? candidate : undefined;
}

export default function SavedExpenseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  // Defensive: if expo-router's hook hasn't surfaced the path param yet
  // (it occasionally returns the bare object during the first render on
  // web), fall back to parsing the pathname directly. Mirrors the
  // server-side parsing in app/api/expenses/[id]+api.ts.
  const expenseId = params.id || extractIdFromPathname();
  const { getToken, isSignedIn } = useAuth();

  const stackScreenOptions = useMemo(
    () => ({ title: 'Expense', headerShown: true, headerBackTitle: 'Back' }),
    [],
  );

  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'loading' });

  const refetch = useCallback(async () => {
    if (!expenseId) {
      // Diagnostic info — surface what the screen actually received so we
      // can see whether it's params, the pathname, or both that are empty.
      const paramsJson = (() => {
        try {
          return JSON.stringify(params);
        } catch {
          return '<unserializable>';
        }
      })();
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '<no window>';
      setFetchState({
        kind: 'error',
        message: `Missing expense id. params=${paramsJson} pathname=${pathname}`,
      });
      return;
    }
    setFetchState({ kind: 'loading' });
    try {
      const detail = await getExpense(async () => getToken(), expenseId);
      if (!detail) {
        setFetchState({ kind: 'not_found' });
      } else {
        setFetchState({ kind: 'ready', data: detail });
      }
    } catch (e) {
      setFetchState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load',
      });
    }
  }, [expenseId, getToken, params]);

  useEffect(() => {
    if (!isSignedIn) return;
    void refetch();
    // refetch is a useCallback; safe to depend on.
  }, [isSignedIn, refetch]);

  if (fetchState.kind === 'loading') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackScreenOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={16} />
          <Skeleton fullWidth height={120} radius={16} />
          <Skeleton fullWidth height={200} radius={16} />
        </ScrollView>
      </View>
    );
  }

  if (fetchState.kind === 'error') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackScreenOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Banner
            variant="error"
            title="Couldn't load this expense"
            description={fetchState.message}
          />
          <Button label="Try again" variant="primary" size="md" onPress={refetch} />
        </ScrollView>
      </View>
    );
  }

  if (fetchState.kind === 'not_found') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={stackScreenOptions} />
        <ScrollView contentContainerStyle={styles.content}>
          <Banner
            variant="info"
            title="Expense not found"
            description="It may have been deleted, or you don't have access. Head back to your trip."
          />
          <Button
            label="Back to home"
            variant="primary"
            size="md"
            onPress={() => router.replace('/(tabs)')}
          />
        </ScrollView>
      </View>
    );
  }

  const { expense, items } = fetchState.data;

  const cat = paletteCategory(expense.category);
  const taxLabel = expense.tax_label?.trim() ? expense.tax_label : 'Tax';
  const taxModeNote = expense.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive';

  return (
    <View style={styles.screen}>
      <Stack.Screen options={stackScreenOptions} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header — merchant + date */}
        <View style={styles.headerBlock}>
          <Text variant="display">{expense.merchant || 'Receipt'}</Text>
          <Text variant="caption" color="textSecondary">
            {formatDateLong(expense.expense_date)}
          </Text>
        </View>

        {/* Hero amount block */}
        <Card raised style={styles.hero}>
          <Text variant="caption" color="textSecondary" style={styles.heroLabel}>
            Total
          </Text>
          <Text variant="display" tabularNums style={styles.heroAmount}>
            {expense.original_currency}{' '}
            {formatMinor(BigInt(expense.original_amount), expense.original_currency)}
          </Text>
          <View style={styles.heroChips}>
            <Chip
              label={prettyCategory(expense.category)}
              leading={<CategoryIcon category={cat} size={20} />}
            />
            <Chip label={`${taxLabel} ${taxModeNote}`} />
          </View>
          {expense.original_currency &&
          BigInt(expense.home_amount) !== BigInt(expense.original_amount) ? (
            <Text variant="caption" color="textSecondary">
              Home equivalent recorded at the time of save.
            </Text>
          ) : null}
        </Card>

        {/* Receipt thumbnail */}
        {expense.receipt_image_path ? (
          <View style={styles.thumbBlock}>
            <ReceiptThumbnail
              size={72}
              accessibilityLabel="Receipt image"
              onPress={() => {
                Alert.alert('Receipt preview', 'Full-screen preview is not wired yet.');
              }}
            />
            <Text variant="caption" color="textSecondary" style={styles.thumbCaption}>
              Tap for full-size receipt (coming soon).
            </Text>
          </View>
        ) : null}

        {/* Breakdown */}
        <Card raised style={styles.section}>
          <Text variant="title">Breakdown</Text>
          <BreakdownRow label="Subtotal" amount={expense.subtotal} expense={expense} />
          {expense.service_charge > 0 ? (
            <BreakdownRow label="Service" amount={expense.service_charge} expense={expense} />
          ) : null}
          {expense.tip > 0 ? (
            <BreakdownRow label="Tip" amount={expense.tip} expense={expense} />
          ) : null}
          {expense.tax_amount > 0 ? (
            <BreakdownRow
              label={`${taxLabel} (${taxModeNote})`}
              amount={expense.tax_amount}
              expense={expense}
            />
          ) : null}
          <View style={styles.totalRow}>
            <Text variant="bodyStrong">Total</Text>
            <Text variant="bodyStrong" tabularNums>
              {expense.original_currency}{' '}
              {formatMinor(BigInt(expense.original_amount), expense.original_currency)}
            </Text>
          </View>
        </Card>

        {/* Items */}
        {items.length > 0 ? (
          <Card raised style={styles.section}>
            <Text variant="title">Items</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text variant="body" style={styles.itemName} numberOfLines={2}>
                  {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
                </Text>
                <Text variant="body" tabularNums>
                  {expense.original_currency}{' '}
                  {formatMinor(BigInt(item.amount), expense.original_currency)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Notes */}
        {expense.notes?.trim() ? (
          <Card raised style={styles.section}>
            <Text variant="title">Notes</Text>
            <Text variant="body" color="textSecondary">
              {expense.notes}
            </Text>
          </Card>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Split"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              Alert.alert(
                'Splitting coming soon',
                'M2 — share groups, per-person panels, proportional tax. Coming up next.',
              );
            }}
          />
          <Button
            label="Scan another"
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => router.replace('/(tabs)/quick-capture')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Breakdown row ───────────────────────────────────────────────────────

function BreakdownRow({
  label,
  amount,
  expense,
}: {
  label: string;
  amount: number;
  expense: ExpenseRecord;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="body" tabularNums>
        {expense.original_currency} {formatMinor(BigInt(amount), expense.original_currency)}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

void Brand;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: Space[16],
    gap: Space[16],
    paddingBottom: Space[32],
  },
  headerBlock: {
    gap: Space[4],
  },
  hero: {
    padding: Space[20],
    gap: Space[12],
    alignItems: 'flex-start',
  },
  heroLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroAmount: {
    paddingVertical: Space[4],
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
  thumbBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[12],
  },
  thumbCaption: {
    flex: 1,
  },
  section: {
    padding: Space[16],
    gap: Space[12],
    borderRadius: Radius.card,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: Space[8],
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space[12],
  },
  itemName: {
    flex: 1,
  },
  actions: {
    gap: Space[8],
    paddingTop: Space[8],
  },
});
