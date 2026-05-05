// Dev-only route to visually verify component primitives. Not linked from
// production navigation. Open at /dev-components in the dev server.

import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ListRow,
  SegmentedControl,
  Skeleton,
  Text,
  TextInput,
} from '@/components/ui';
import { Category, Neutral, Space } from '@/constants/theme';

const TAX_MODE_OPTIONS = [
  { label: 'Inclusive', value: 'inclusive' },
  { label: 'Exclusive', value: 'exclusive' },
] as const;

const CURRENCIES = ['SGD', 'USD', 'EUR', 'MYR', 'JPY'] as const;

export default function DevComponentsScreen() {
  const [merchant, setMerchant] = useState('Hawker Heaven');
  const [notes, setNotes] = useState('');
  const [merchantError, setMerchantError] = useState('');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('exclusive');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('SGD');

  return (
    <>
      <Stack.Screen options={{ title: 'Components' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Section title="Text — type scale">
          <Text variant="displayXl" tabularNums>
            S$432.50
          </Text>
          <Text variant="display">Display 28</Text>
          <Text variant="title">Title 22</Text>
          <Text variant="subtitle">Subtitle 17</Text>
          <Text variant="body">Body 15 — default. The quick brown fox.</Text>
          <Text variant="bodyStrong">Body strong 15 / 500</Text>
          <Text variant="amountInline" tabularNums>
            S$20.38 inline amount
          </Text>
          <Text variant="caption" color="textSecondary">
            Caption 13 / 400 — secondary
          </Text>
          <Text variant="chip" color="textSecondary">
            CHIP 12 / 600
          </Text>
        </Section>

        <Section title="Text — color tokens">
          <Text color="textPrimary">textPrimary</Text>
          <Text color="textSecondary">textSecondary</Text>
          <Text color="textDisabled">textDisabled</Text>
          <Text color="brandAccent">brandAccent</Text>
          <Text color="brandInteractive">brandInteractive</Text>
          <Text color="infoFg">infoFg</Text>
          <Text color="successFg">successFg</Text>
          <Text color="warningFg">warningFg</Text>
          <Text color="errorFg">errorFg</Text>
        </Section>

        <Section title="Button — variants × sizes">
          <View style={styles.row}>
            <Button label="Primary sm" variant="primary" size="sm" onPress={() => {}} />
            <Button label="Primary md" variant="primary" size="md" onPress={() => {}} />
            <Button label="Primary lg" variant="primary" size="lg" onPress={() => {}} />
          </View>
          <View style={styles.row}>
            <Button label="Secondary md" variant="secondary" size="md" onPress={() => {}} />
            <Button label="Ghost md" variant="ghost" size="md" onPress={() => {}} />
          </View>
          <View style={styles.row}>
            <Button label="Disabled" variant="primary" disabled onPress={() => {}} />
            <Button label="Loading" variant="primary" loading onPress={() => {}} />
          </View>
          <Button
            label="Full width primary"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {}}
          />
        </Section>

        <Section title="TextInput">
          <TextInput
            label="Merchant"
            value={merchant}
            onChangeText={setMerchant}
            placeholder="e.g., Hawker Heaven"
          />
          <TextInput
            label="With helper"
            value=""
            onChangeText={() => {}}
            placeholder="Helper text below"
            helper="ISO 4217 currency code, three letters."
          />
          <TextInput
            label="With error"
            value="invalid"
            onChangeText={() => {}}
            error="Looks like a typo — currencies are 3-letter codes."
          />
          <View style={styles.row}>
            <Button
              label={merchantError ? 'Clear error' : 'Trigger error'}
              variant="ghost"
              size="sm"
              onPress={() => setMerchantError(merchantError ? '' : 'Merchant is required')}
            />
          </View>
          <TextInput
            label="Disabled"
            value="Cannot edit this"
            onChangeText={() => {}}
            editable={false}
          />
          <TextInput
            label="Notes (multi-line)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything to remember about this expense?"
            multiline
          />
        </Section>

        <Section title="Chip — selectable, with leading dot">
          <View style={styles.row}>
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
            ))}
          </View>
          <View style={styles.row}>
            <Chip label="Meals" leadingDot={Category.meals.icon} />
            <Chip label="Transport" leadingDot={Category.transport.icon} />
            <Chip label="Lodging" leadingDot={Category.lodging.icon} />
            <Chip label="Entertainment" leadingDot={Category.entertainment.icon} />
            <Chip label="Disabled" disabled />
          </View>
        </Section>

        <Section title="SegmentedControl">
          <SegmentedControl
            options={TAX_MODE_OPTIONS}
            value={taxMode}
            onChange={setTaxMode}
            accessibilityLabel="Tax mode"
          />
          <Text variant="caption" color="textSecondary">
            Active: {taxMode}
          </Text>
        </Section>

        <Section title="Card">
          <Card>
            <Text variant="subtitle">Default card (flat)</Text>
            <Text variant="body" color="textSecondary">
              Solid white surface, hairline border.
            </Text>
          </Card>
          <Card raised>
            <Text variant="subtitle">Raised card</Text>
            <Text variant="body" color="textSecondary">
              Same surface + Shadow.xs for subtle elevation.
            </Text>
          </Card>
          <Card onPress={() => {}}>
            <Text variant="subtitle">Pressable card</Text>
            <Text variant="body" color="textSecondary">
              Tappable. Whole surface is the press target.
            </Text>
          </Card>
        </Section>

        <Section title="ListRow">
          <Card padding={0}>
            <ListRow
              title="Hawker Heaven"
              subtitle="Today · Meals"
              leading={
                <View style={[styles.categoryStub, { backgroundColor: Category.meals.tint }]}>
                  <Text
                    variant="bodyStrong"
                    color="textPrimary"
                    style={{ color: Category.meals.glyph }}
                  >
                    🍴
                  </Text>
                </View>
              }
              trailing={
                <Text variant="bodyStrong" tabularNums>
                  S$20.38
                </Text>
              }
              onPress={() => {}}
            />
            <ListRow
              title="Grab to Ubud"
              subtitle="Yesterday · Transport"
              leading={
                <View style={[styles.categoryStub, { backgroundColor: Category.transport.tint }]}>
                  <Text variant="bodyStrong" style={{ color: Category.transport.glyph }}>
                    🚕
                  </Text>
                </View>
              }
              trailing={
                <Text variant="bodyStrong" tabularNums>
                  S$14.00
                </Text>
              }
              onPress={() => {}}
            />
            <ListRow
              title="The Ritz Bali"
              subtitle="Apr 12 · Lodging"
              leading={
                <View style={[styles.categoryStub, { backgroundColor: Category.lodging.tint }]}>
                  <Text variant="bodyStrong" style={{ color: Category.lodging.glyph }}>
                    🏨
                  </Text>
                </View>
              }
              trailing={
                <Text variant="bodyStrong" tabularNums>
                  S$398.00
                </Text>
              }
              separator={false}
              onPress={() => {}}
            />
          </Card>
        </Section>

        <Section title="Banner — semantic states">
          <Banner
            variant="info"
            title="You're offline"
            description="Showing cached data — Save will queue when you're back online."
          />
          <Banner
            variant="success"
            title="Saved"
            description="Your expense is in the trip ledger."
          />
          <Banner
            variant="warning"
            title="Please verify these values"
            description="The receipt was hard to read. Double-check totals before saving."
          />
          <Banner
            variant="error"
            title="Couldn't save"
            description="The server rejected the request. Try again in a moment."
          />
        </Section>

        <Section title="Skeleton">
          <Skeleton fullWidth height={28} />
          <Skeleton fullWidth height={16} />
          <Skeleton width={180} height={16} />
          <View style={styles.skeletonRow}>
            <Skeleton width={48} height={48} radius={12} />
            <View style={styles.skeletonStack}>
              <Skeleton fullWidth height={16} />
              <Skeleton width={120} height={12} />
            </View>
          </View>
        </Section>

        <Section title="EmptyState">
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration={<Text variant="displayXl">🧳</Text>}
              title="Start a trip to begin"
              description="Create your first trip to track and split receipts."
              cta={{ label: 'Create a trip', onPress: () => {} }}
            />
          </View>
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: Space[16],
    gap: Space[32],
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Space[12],
  },
  sectionTitle: {
    marginBottom: Space[4],
  },
  sectionBody: {
    gap: Space[12],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[12],
    alignItems: 'center',
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space[12],
    alignItems: 'center',
  },
  skeletonStack: {
    flex: 1,
    gap: Space[8],
  },
  emptyWrap: {
    height: 320,
    backgroundColor: Neutral.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
  },
  // Placeholder for the category icon tile until chunk 2c ships CategoryIcon.
  categoryStub: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
