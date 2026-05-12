// C5 — Expense edit form (working register).
//
// Reusable across:
//   - single-receipt M1 scan → save flow (primary use)
//   - QC tray full-edit fallback ([draftId] route)
//   - post-save edit from C6 detail (future)
//
// Visual: white surface, hairline borders, Geist throughout. Hero register
// is reserved for home/saved-detail, not here. Codex owns final polish.
//
// State: pure presentational. Parent owns the ExtractedExpense and feeds
// changes back via onChange(patch). The form never owns long-term state.

import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Chip } from '@/components/ui/chip';
import { CurrencyInput } from '@/components/ui/currency-input';
import { ReceiptThumbnail } from '@/components/ui/receipt-thumbnail';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Neutral, Radius, Rhythm, Space } from '@/constants/theme';
import { CATEGORIES, type ExtractedExpense, TAX_MODES_AI } from '@/lib/ai/schema';
import { formatMinor } from '@/lib/fx/currency';

// ─── Types ───────────────────────────────────────────────────────────────

type Item = ExtractedExpense['items'][number];

export type ExpenseEditFormProps = {
  /** Current form values. Parent owns; form is controlled. */
  value: ExtractedExpense;
  /** Patch callback. Parent merges and re-feeds via `value`. */
  onChange: (patch: Partial<ExtractedExpense>) => void;
  /** Receipt image source for the thumbnail tile. URI / require / null. */
  receiptImage?: React.ComponentProps<typeof ReceiptThumbnail>['source'];

  /** Primary action label. Defaults to "Save expense". */
  primaryActionLabel?: string;
  /** Primary action handler (typically: persist to server). */
  onPrimaryAction: () => void;
  /** Show spinner + disable on the sticky save bar. */
  primaryActionPending?: boolean;
  /** Force-disable (e.g. validation failure). Pending implies disabled. */
  primaryActionDisabled?: boolean;

  /** Optional slot rendered above the form (e.g. QC batch dot row). */
  statusRow?: React.ReactNode;
  /** Optional slot rendered between status row and form (banners). */
  topBanner?: React.ReactNode;

  /** Currency picker callback. If omitted, currency chip is read-only. */
  onChangeCurrency?: () => void;

  /** Receipt thumbnail tap handler (e.g. open full-screen preview). */
  onPressReceipt?: () => void;
};

// ─── Constants ───────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: (typeof CATEGORIES)[number]; label: string }[] = [
  { value: 'meals', label: 'Meals' },
  { value: 'transport', label: 'Transport' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];

const TAX_MODE_OPTIONS = TAX_MODES_AI.map((m) => ({
  value: m,
  label: m === 'inclusive' ? 'Inclusive' : m === 'exclusive' ? 'Exclusive' : 'None',
}));

// ─── Component ───────────────────────────────────────────────────────────

export function ExpenseEditForm({
  value,
  onChange,
  receiptImage,
  primaryActionLabel = 'Save expense',
  onPrimaryAction,
  primaryActionPending = false,
  primaryActionDisabled = false,
  statusRow,
  topBanner,
  onChangeCurrency,
  onPressReceipt,
}: ExpenseEditFormProps) {
  // Total is always derived from its parts — see docs/specs/m2-splitting.md §5.
  //   inclusive: total = subtotal + service + tip       (tax already inside subtotal)
  //   exclusive: total = subtotal + service + tip + tax
  //   none:      total = subtotal + service + tip       (tax_amount should be 0)
  // We compute through bigint to keep the arithmetic exact at the cents level
  // before narrowing back to number for the schema.
  const computedTotalCents = useMemo(() => {
    return computeTotalCents({
      subtotal_cents: value.subtotal_cents,
      service_charge_cents: value.service_charge_cents,
      tip_cents: value.tip_cents,
      tax_amount_cents: value.tax_amount_cents,
      tax_mode: value.tax_mode,
    });
  }, [
    value.subtotal_cents,
    value.service_charge_cents,
    value.tip_cents,
    value.tax_amount_cents,
    value.tax_mode,
  ]);

  // Sync the derived total back to the parent so persistence sees the right
  // number. Safe vs. infinite loops: once parent reflects the same value, the
  // effect's equality check no-ops.
  useEffect(() => {
    if (value.total_cents !== computedTotalCents) {
      onChange({ total_cents: computedTotalCents });
    }
  }, [computedTotalCents, value.total_cents, onChange]);

  const showLowConfidence = value.confidence.overall < 0.7;

  const updateItem = (index: number, patch: Partial<Item>) => {
    const next = [...value.items];
    const merged: Item = { ...next[index], ...patch };
    // Recompute amount from quantity × unit when either changed.
    if (patch.quantity !== undefined || patch.unit_amount_cents !== undefined) {
      merged.amount_cents = Math.round(merged.quantity * merged.unit_amount_cents);
    }
    next[index] = merged;
    onChange({ items: next });
  };

  const addItem = () => {
    const next: Item[] = [
      ...value.items,
      { name: '', quantity: 1, unit_amount_cents: 0, amount_cents: 0 },
    ];
    onChange({ items: next });
  };

  const removeItem = (index: number) => {
    const next = value.items.filter((_, i) => i !== index);
    onChange({ items: next });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {statusRow ? <View style={styles.statusRow}>{statusRow}</View> : null}

        {/* Receipt currency override — top of screen per ux-principles "Bill splitting specifics" */}
        <View style={styles.currencyRow}>
          <Text variant="caption" color="textSecondary">
            Receipt currency
          </Text>
          <Chip
            label={value.currency}
            selected
            onPress={onChangeCurrency}
            accessibilityLabel={`Receipt currency: ${value.currency}${onChangeCurrency ? '. Tap to change.' : ''}`}
          />
        </View>

        {topBanner}

        {showLowConfidence ? (
          <Banner
            variant="warning"
            title="Please verify these values."
            description="Confidence was low on this extraction. Touching any field clears the flag."
          />
        ) : null}

        {/* ─── Receipt section ─── */}
        <Section title="Receipt">
          <View style={styles.receiptRow}>
            <ReceiptThumbnail
              source={receiptImage}
              size={56}
              onPress={onPressReceipt}
              accessibilityLabel="Receipt image"
            />
            <View style={styles.receiptFields}>
              <TextInput
                label="Merchant"
                value={value.merchant}
                onChangeText={(merchant) => onChange({ merchant })}
                placeholder="e.g. Hawker Heaven"
                autoCapitalize="words"
              />
            </View>
          </View>

          <TextInput
            label="Date"
            value={value.expense_date}
            onChangeText={(expense_date) => onChange({ expense_date })}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.fieldGroup}>
            <Text variant="caption" color="textSecondary">
              Category
            </Text>
            <View style={styles.categoryRow}>
              <CategoryIcon
                category={value.category_guess === 'shopping' ? 'other' : value.category_guess}
                size={40}
              />
              <View style={styles.categoryChips}>
                {CATEGORY_OPTIONS.map((c) => (
                  <Chip
                    key={c.value}
                    label={c.label}
                    selected={value.category_guess === c.value}
                    onPress={() => onChange({ category_guess: c.value })}
                  />
                ))}
              </View>
            </View>
          </View>
        </Section>

        {/* ─── Items section ─── */}
        <Section title="Items">
          {value.items.length === 0 ? (
            <Text variant="body" color="textSecondary">
              No items extracted. Add one below if you need to.
            </Text>
          ) : (
            value.items.map((item, idx) => (
              <ItemRow
                key={idx}
                item={item}
                currency={value.currency}
                onChange={(patch) => updateItem(idx, patch)}
                onRemove={() => removeItem(idx)}
              />
            ))
          )}
          <Button label="+ Add item" variant="ghost" size="sm" onPress={addItem} />
        </Section>

        {/* ─── Totals section ─── */}
        <Section title="Totals">
          <CurrencyInput
            label="Subtotal"
            value={BigInt(value.subtotal_cents)}
            onChangeMinor={(v) => onChange({ subtotal_cents: v === null ? 0 : Number(v) })}
            currency={value.currency}
          />
          <CurrencyInput
            label="Service charge"
            value={BigInt(value.service_charge_cents)}
            onChangeMinor={(v) => onChange({ service_charge_cents: v === null ? 0 : Number(v) })}
            currency={value.currency}
          />
          <CurrencyInput
            label="Tip"
            value={BigInt(value.tip_cents)}
            onChangeMinor={(v) => onChange({ tip_cents: v === null ? 0 : Number(v) })}
            currency={value.currency}
          />

          <View style={styles.fieldGroup}>
            <Text variant="caption" color="textSecondary">
              Tax
            </Text>
            <SegmentedControl
              options={TAX_MODE_OPTIONS}
              value={value.tax_mode}
              onChange={(tax_mode) => onChange({ tax_mode })}
              accessibilityLabel="Tax mode"
            />
            <View style={styles.taxRow}>
              <TextInput
                label="Label"
                value={value.tax_label}
                onChangeText={(tax_label) => onChange({ tax_label })}
                placeholder="GST"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <CurrencyInput
                label="Amount"
                value={BigInt(value.tax_amount_cents)}
                onChangeMinor={(v) => onChange({ tax_amount_cents: v === null ? 0 : Number(v) })}
                currency={value.currency}
                editable={value.tax_mode !== 'none'}
              />
            </View>
          </View>

          <View style={styles.totalRow}>
            <View style={styles.totalLabelRow}>
              <Text variant="subtitle">Total</Text>
              <Text variant="caption" color="textSecondary">
                Auto-calculated
              </Text>
            </View>
            <CurrencyInput
              value={BigInt(computedTotalCents)}
              // Read-only: Total derives from subtotal + service + tip (+ tax
              // when exclusive). onChangeMinor is required by the type but
              // can't fire when editable is false.
              onChangeMinor={() => {}}
              currency={value.currency}
              editable={false}
              accessibilityLabel="Total (auto-calculated)"
            />
          </View>
        </Section>

        {/* ─── Notes section ─── */}
        <Section title="Notes">
          <TextInput
            value={value.notes}
            onChangeText={(notes) => onChange({ notes })}
            placeholder="Anything to remember about this expense?"
            multiline
            numberOfLines={3}
          />
        </Section>
      </ScrollView>

      {/* Sticky save bar */}
      <View style={styles.saveBar}>
        <Button
          label={primaryActionPending ? 'Saving…' : primaryActionLabel}
          variant="primary"
          size="lg"
          fullWidth
          onPress={onPrimaryAction}
          disabled={primaryActionPending || primaryActionDisabled}
        />
      </View>
    </View>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title">{title}</Text>
        {trailing}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ─── Item row ────────────────────────────────────────────────────────────

function ItemRow({
  item,
  currency,
  onChange,
  onRemove,
}: {
  item: Item;
  currency: string;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemNameRow}>
        <View style={styles.itemNameField}>
          <TextInput
            label="Item"
            value={item.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="Item name"
          />
        </View>
        <Button
          label="Remove"
          variant="ghost"
          size="sm"
          onPress={onRemove}
          accessibilityLabel="Remove item"
        />
      </View>
      <View style={styles.itemAmountRow}>
        <View style={styles.itemQuantityField}>
          <TextInput
            label="Qty"
            value={String(item.quantity)}
            onChangeText={(s) => {
              const n = Number(s);
              if (!Number.isFinite(n) || n < 0) return;
              onChange({ quantity: n });
            }}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.itemUnitField}>
          <CurrencyInput
            label="Unit price"
            value={BigInt(item.unit_amount_cents)}
            onChangeMinor={(v) => onChange({ unit_amount_cents: v === null ? 0 : Number(v) })}
            currency={currency}
          />
        </View>
      </View>
      <View style={styles.itemSubtotalRow}>
        <Text variant="caption" color="textSecondary">
          Subtotal
        </Text>
        <Text variant="bodyStrong" tabularNums>
          {currency} {formatMinor(BigInt(item.amount_cents), currency)}
        </Text>
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Derive total_cents from its components. Cents-as-bigint internally for
 * precision; returns number to match the schema. tax_mode semantics:
 *   - inclusive: tax already inside subtotal → don't add it again
 *   - exclusive: tax sits outside subtotal → add it
 *   - none:      tax should be 0; treated like inclusive (no addition)
 */
export function computeTotalCents(parts: {
  subtotal_cents: number;
  service_charge_cents: number;
  tip_cents: number;
  tax_amount_cents: number;
  tax_mode: ExtractedExpense['tax_mode'];
}): number {
  const subtotal = BigInt(Math.trunc(parts.subtotal_cents));
  const service = BigInt(Math.trunc(parts.service_charge_cents));
  const tip = BigInt(Math.trunc(parts.tip_cents));
  const tax = BigInt(Math.trunc(parts.tax_amount_cents));
  const base = subtotal + service + tip;
  const total = parts.tax_mode === 'exclusive' ? base + tax : base;
  return Number(total);
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neutral.canvas,
  },
  content: {
    padding: Space[16],
    paddingBottom: Rhythm.bottomContentPaddingWithStickyBar,
    gap: Space[24],
  },
  statusRow: {
    paddingBottom: Space[8],
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Neutral.surface,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: Radius.card,
    paddingHorizontal: Space[16],
    paddingVertical: Space[12],
    gap: Space[12],
  },
  section: {
    backgroundColor: Neutral.surface,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
    borderRadius: Radius.card,
    padding: Space[16],
    gap: Space[16],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionBody: {
    gap: Space[12],
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space[12],
  },
  receiptFields: {
    flex: 1,
    gap: Space[12],
  },
  fieldGroup: {
    gap: Space[8],
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space[12],
  },
  categoryChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
  taxRow: {
    flexDirection: 'row',
    gap: Space[8],
  },
  totalRow: {
    gap: Space[8],
    paddingTop: Space[8],
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
  },
  totalLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space[8],
  },
  itemRow: {
    gap: Space[8],
    paddingBottom: Space[12],
    borderBottomWidth: 1,
    borderBottomColor: Neutral.borderSubtle,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space[8],
  },
  itemNameField: {
    flex: 1,
  },
  itemAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space[8],
  },
  itemQuantityField: {
    width: 64,
  },
  itemUnitField: {
    flex: 1,
  },
  itemSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: Space[4],
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Neutral.surface,
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    paddingHorizontal: Space[16],
    paddingTop: Space[12],
    paddingBottom: Space[24],
    minHeight: Rhythm.stickySaveBarHeight + Rhythm.stickySaveBarMinSafeArea,
  },
});
