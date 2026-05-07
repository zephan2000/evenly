import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useMockFontSet } from '@/components/mockup-font-provider';
import {
  AppScreen,
  Button,
  Card,
  CategoryIcon,
  Chip,
  EditorialHero,
  ListRow,
  SectionHeader,
  Text,
} from '@/components/ui';
import { BrandAssets } from '@/constants/brand-assets';
import { Brand, Neutral, Radius } from '@/constants/theme';

const expenseRows = [
  {
    category: 'lodging',
    title: 'Cliffside stay',
    subtitle: 'Paid by Zephan · Split 4 ways',
    amount: '$312.40',
  },
  {
    category: 'meals',
    title: 'Seafood lunch',
    subtitle: 'Added from receipt scan',
    amount: '$84.20',
  },
  {
    category: 'transport',
    title: 'Harbor taxi',
    subtitle: 'Paid by Maya · Settles tomorrow',
    amount: '$26.00',
  },
] as const;

export default function HomeScreen() {
  const { headlineMood } = useMockFontSet();
  const decorativeHeadingStyle = decorativeHeadingStyles[headlineMood];

  return (
    <AppScreen>
      <EditorialHero
        imageSource={BrandAssets.homeHero}
        metaLeft="MAY 2026"
        metaCenter="evenly"
        metaRight="shared trip"
        headline={`breezy\nsplits`}
        subtitle="Keep the trip light. Let the math stay in the background."
        headlineStyle={decorativeHeadingStyle.displayXl}
        minHeight={436}
        footer={
          <View style={styles.heroFooter}>
            <View>
              <Text variant="caption" style={styles.heroAmountLabel}>
                Current trip total
              </Text>
              <Text variant="display" color="inverse" tabularNums style={styles.heroAmount}>
                $842.40
              </Text>
            </View>
            <Button label="Add expense" size="lg" />
          </View>
        }
      />

      <SectionHeader title="Settle softly" trailing={<Chip label="3 people owed" selected />} />

      <Card raised style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryMetric}>
            <Text variant="caption" color="textSecondary">
              You paid
            </Text>
            <Text variant="title" tabularNums>
              $421.20
            </Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text variant="caption" color="textSecondary">
              You’re owed
            </Text>
            <Text variant="title" tabularNums style={styles.owedValue}>
              $138.50
            </Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          <Chip label="Low friction" leadingDot="#2457D6" />
          <Chip label="Scan first" leadingDot="#30A46C" />
          <Chip label="Auto-split" leadingDot="#F76B15" />
        </View>
      </Card>

      <SectionHeader
        title="Recent expenses"
        trailing={
          <Text variant="body" color="brandInteractive">
            View all
          </Text>
        }
      />

      <Card padding={0} raised>
        {expenseRows.map((row, index) => (
          <ListRow
            key={row.title}
            title={row.title}
            subtitle={row.subtitle}
            leading={<CategoryIcon category={row.category} />}
            trailing={
              <Text variant="bodyStrong" tabularNums>
                {row.amount}
              </Text>
            }
            separator={index < expenseRows.length - 1}
          />
        ))}
      </Card>

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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroFooter: {
    gap: 16,
  },
  heroAmountLabel: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 34,
    lineHeight: 38,
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
