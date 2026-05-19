// Dev-only route to visually verify component primitives. Not linked from
// production navigation. Open at /dev-components in the dev server.

import { Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Banner,
  BottomSheet,
  type BottomSheetHandle,
  Button,
  Card,
  CategoryIcon,
  Chip,
  CurrencyInput,
  EmptyIllustration,
  EmptyState,
  ListRow,
  ReceiptThumbnail,
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
  const [amountMinor, setAmountMinor] = useState<bigint | null>(2038n);
  const [tipMinor, setTipMinor] = useState<bigint | null>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);
  const dynamicSheetRef = useRef<BottomSheetHandle>(null);

  return (
    <>
      <Stack.Screen options={{ title: 'Components', headerShown: true }} />
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

        <Section title="CategoryIcon — six categories">
          <View style={styles.row}>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="meals" />
              <Text variant="caption" color="textSecondary">
                Meals
              </Text>
            </View>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="transport" />
              <Text variant="caption" color="textSecondary">
                Transport
              </Text>
            </View>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="lodging" />
              <Text variant="caption" color="textSecondary">
                Lodging
              </Text>
            </View>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="entertainment" />
              <Text variant="caption" color="textSecondary">
                Entertainment
              </Text>
            </View>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="groceries" />
              <Text variant="caption" color="textSecondary">
                Groceries
              </Text>
            </View>
            <View style={styles.categoryDemo}>
              <CategoryIcon category="other" />
              <Text variant="caption" color="textSecondary">
                Other
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <CategoryIcon category="meals" size={28} />
            <CategoryIcon category="meals" size={40} />
            <CategoryIcon category="meals" size={56} />
            <CategoryIcon category="meals" size={72} />
          </View>
        </Section>

        <Section title="ReceiptThumbnail">
          <View style={styles.row}>
            <ReceiptThumbnail caption="receipt-001.jpg" />
            <ReceiptThumbnail caption="Tap to preview" onPress={() => {}} />
            <ReceiptThumbnail size={72} caption="72pt variant" />
          </View>
        </Section>

        <Section title="ListRow">
          <Card padding={0}>
            <ListRow
              title="Hawker Heaven"
              subtitle="Today · Meals"
              leading={<CategoryIcon category="meals" />}
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
              leading={<CategoryIcon category="transport" />}
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
              leading={<CategoryIcon category="lodging" />}
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

        <Section title="CurrencyInput">
          <CurrencyInput
            label="Total"
            value={amountMinor}
            onChangeMinor={setAmountMinor}
            currency={currency}
            helper={`Stored: ${amountMinor === null ? 'null' : amountMinor.toString() + ' minor units'}`}
          />
          <CurrencyInput
            label="Tip (optional)"
            value={tipMinor}
            onChangeMinor={setTipMinor}
            currency={currency}
            helper="Empty by default — leave blank when no tip."
          />
          <CurrencyInput
            label="With error"
            value={null}
            onChangeMinor={() => {}}
            currency={currency}
            error="Total is required."
          />
          <CurrencyInput
            label="Disabled"
            value={9999n}
            onChangeMinor={() => {}}
            currency={currency}
            editable={false}
          />
          <Text variant="caption" color="textSecondary">
            Switch the chip above (SGD/USD/EUR/MYR/JPY) to see decimals re-format.
          </Text>
        </Section>

        <Section title="BottomSheet">
          <View style={styles.row}>
            <Button label="Open half-sheet" onPress={() => sheetRef.current?.present()} />
            <Button
              label="Open dynamic-sized"
              variant="secondary"
              onPress={() => dynamicSheetRef.current?.present()}
            />
          </View>
          <Text variant="caption" color="textSecondary">
            Drag the handle down to dismiss, or tap the backdrop.
          </Text>
        </Section>

        <Section title="EmptyState">
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration={<EmptyIllustration name="bag-suitcase" />}
              title="Start a trip to begin"
              description="Create your first trip to track and split receipts."
              cta={{ label: 'Create a trip', onPress: () => {} }}
            />
          </View>
        </Section>
      </ScrollView>

      <BottomSheet ref={sheetRef} title="New trip" snapPoints={['50%']}>
        <Text variant="body" color="textSecondary">
          This is a half-sheet. In C3 it&apos;ll host the trip-create form.
        </Text>
        <View style={styles.row}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </View>
        <Button
          label="Close"
          variant="secondary"
          fullWidth
          onPress={() => sheetRef.current?.dismiss()}
        />
      </BottomSheet>

      <BottomSheet ref={dynamicSheetRef} title="Compact sheet" enableDynamicSizing>
        <Text variant="body" color="textSecondary">
          Dynamic sizing — sheet hugs its content height.
        </Text>
        <Button label="Got it" fullWidth onPress={() => dynamicSheetRef.current?.dismiss()} />
      </BottomSheet>
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
  categoryDemo: {
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
  },
});
