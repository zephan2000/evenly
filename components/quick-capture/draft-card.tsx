// Tray row for one draft expense in Quick capture (M1.5).
//
// Fully controlled by the tray screen — this component owns no state. The
// parent decides which card is expanded (only one at a time per spec §5.2)
// and dispatches every mutation back through the reducer.
//
// Visual rules per docs/specs/quick-capture.md §5.2:
//   - Capture order is preserved; never reorders by status.
//   - Tap expands inline for quick correction; full-screen C5 is fallback.
//   - Cause-aware failure recovery actions (Retry upload / Retry extraction /
//     Re-pick / Open full edit / Discard) — never a generic "Retry".
//   - Per-receipt trip chip appears only when batch is in `per_receipt` mode.

import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { CurrencyPickerSheet } from '@/components/quick-capture/currency-picker-sheet';
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Chip } from '@/components/ui/chip';
import { CurrencyInput } from '@/components/ui/currency-input';
import { ReceiptThumbnail } from '@/components/ui/receipt-thumbnail';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Neutral, Rhythm, Semantic, Space } from '@/constants/theme';
import type { CategoryKey } from '@/constants/theme';
import type { ExtractedExpense } from '@/lib/ai/schema';
import { QUICK_PICKS } from '@/lib/fx/currencies';
import {
  type DraftExpense,
  type TripMode,
  type VisibleStatus,
  visibleStatusOf,
} from '@/lib/quick-capture/state';

// Category palette covers six visible categories. The schema also includes
// 'shopping'; if the AI returns it, we display the chip with the 'other'
// palette and treat it as selectable like any other category.
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

export type TripSummary = {
  id: string;
  name: string;
};

export type DraftCardProps = {
  draft: DraftExpense;
  /** Whether this card is currently expanded for inline edit. Parent controls. */
  expanded: boolean;
  /** Batch trip mode — controls visibility of the per-card trip chip. */
  tripMode: TripMode;
  /** Trip lookup for resolving `draft.tripId` → display name. */
  tripById: Record<string, TripSummary>;

  // Expansion + persistence
  onToggleExpand: (draftId: string) => void;
  onApplyEdit: (draftId: string, patch: Partial<ExtractedExpense>) => void;
  onDiscard: (draftId: string) => void;
  onOpenFullEdit: (draftId: string) => void;

  // Cause-aware failure recovery (§5.2)
  onRetryUpload: (draftId: string) => void;
  onRetryExtraction: (draftId: string) => void;
  onRetrySave: (draftId: string) => void;
  onRePick: (draftId: string) => void;

  // Per-receipt trip override (§5.7.1) — invoked by the per-card chip; the
  // parent opens a single-card trip picker sheet.
  onChangeTripForDraft: (draftId: string) => void;
};

export function DraftCard({
  draft,
  expanded,
  tripMode,
  tripById,
  onToggleExpand,
  onApplyEdit,
  onDiscard,
  onOpenFullEdit,
  onRetryUpload,
  onRetryExtraction,
  onRetrySave,
  onRePick,
  onChangeTripForDraft,
}: DraftCardProps) {
  const visible = visibleStatusOf(draft);
  const merchant = draft.extracted?.merchant?.trim() ? draft.extracted.merchant : null;
  const trip = tripById[draft.tripId];

  return (
    <Card padding={0} style={styles.card}>
      <Pressable
        onPress={() => onToggleExpand(draft.id)}
        accessibilityRole="button"
        accessibilityLabel={
          merchant
            ? `${merchant}, ${visibleLabel(visible)}, ${expanded ? 'expanded' : 'collapsed'}`
            : `Receipt, ${visibleLabel(visible)}, ${expanded ? 'expanded' : 'collapsed'}`
        }
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <ReceiptThumbnail source={draft.imageUri} />
        <View style={styles.body}>
          <View style={styles.merchantRow}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.merchant}>
              {merchant ?? merchantPlaceholder(visible)}
            </Text>
            {draft.extracted ? (
              <Text variant="amountInline" tabularNums style={styles.total}>
                {formatTotal(draft.extracted)}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {summaryLine(draft)}
          </Text>
          <StatusLine visible={visible} draft={draft} />
        </View>
        <TrailingIcon visible={visible} expanded={expanded} />
      </Pressable>

      {tripMode === 'per_receipt' && trip ? (
        <View style={styles.tripChipRow}>
          <Chip
            label={trip.name}
            leading={<Ionicons name="airplane-outline" size={14} color={Neutral.textSecondary} />}
            onPress={draft.status === 'saved' ? undefined : () => onChangeTripForDraft(draft.id)}
            disabled={draft.status === 'saved'}
            accessibilityLabel={`Trip: ${trip.name}${draft.status === 'saved' ? ' (saved, read-only)' : ''}`}
          />
        </View>
      ) : null}

      {visible === 'failed' ? (
        <FailedActions
          draft={draft}
          onRetryUpload={onRetryUpload}
          onRetryExtraction={onRetryExtraction}
          onRetrySave={onRetrySave}
          onRePick={onRePick}
          onOpenFullEdit={onOpenFullEdit}
          onDiscard={onDiscard}
        />
      ) : null}

      {expanded && draft.extracted ? (
        <ExpandedEditor
          draft={draft}
          onApplyEdit={onApplyEdit}
          onDiscard={onDiscard}
          onOpenFullEdit={onOpenFullEdit}
          onCollapse={() => onToggleExpand(draft.id)}
        />
      ) : null}
    </Card>
  );
}

// ─── Status line ─────────────────────────────────────────────────────────

function StatusLine({ visible, draft }: { visible: VisibleStatus; draft: DraftExpense }) {
  const text = statusLineText(visible, draft);
  if (!text) return null;
  return (
    <Text variant="caption" color={statusColor(visible)} numberOfLines={1}>
      {text}
    </Text>
  );
}

function statusLineText(visible: VisibleStatus, draft: DraftExpense): string | null {
  switch (visible) {
    case 'processing':
      if (draft.status === 'pending_upload' || draft.status === 'uploading') return 'Uploading…';
      if (draft.status === 'extracting') return 'Reading receipt…';
      if (draft.status === 'saving') return 'Saving…';
      return null;
    case 'needs_review':
      return 'Needs review';
    case 'failed': {
      if (draft.status === 'upload_failed') return 'Upload failed';
      if (draft.status === 'extract_failed') return 'Couldn’t read this receipt';
      if (draft.reviewState === 'failed') return 'Save failed';
      return 'Failed';
    }
    case 'saved':
      return 'Saved';
    case 'ready':
    default:
      return null;
  }
}

function statusColor(visible: VisibleStatus): React.ComponentProps<typeof Text>['color'] {
  switch (visible) {
    case 'failed':
      return 'errorFg';
    case 'needs_review':
      return 'warningFg';
    case 'saved':
      return 'successFg';
    default:
      return 'textSecondary';
  }
}

function visibleLabel(visible: VisibleStatus): string {
  switch (visible) {
    case 'processing':
      return 'processing';
    case 'ready':
      return 'ready';
    case 'needs_review':
      return 'needs review';
    case 'failed':
      return 'failed';
    case 'saved':
      return 'saved';
  }
}

function merchantPlaceholder(visible: VisibleStatus): string {
  if (visible === 'processing') return '…';
  return 'Receipt';
}

// ─── Summary line — date · currency ──────────────────────────────────────

function summaryLine(draft: DraftExpense): string {
  const ext = draft.extracted;
  if (!ext) return 'Awaiting extraction';
  const parts: string[] = [];
  if (ext.expense_date) parts.push(formatDate(ext.expense_date));
  if (ext.currency) parts.push(ext.currency);
  if (ext.category_guess) parts.push(prettyCategory(ext.category_guess));
  return parts.join(' · ');
}

function prettyCategory(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function formatDate(iso: string): string {
  // ISO YYYY-MM-DD → Mon DD per common-glance conventions; fall back to raw.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
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
  if (monthIdx < 0 || monthIdx >= 12) return iso;
  return `${months[monthIdx]} ${day}`;
}

function formatTotal(ext: ExtractedExpense): string {
  // `total_cents` is stored as integer cents per schema; convert to display.
  // CurrencyInput library handles minor units in bigint, but here we just need
  // a glance-formatted string. Schema decimals are fixed at 2 for this field
  // (the schema uses cents); for non-2-decimal currencies the AI is expected
  // to return correctly-scaled cents per its spec contract.
  const n = ext.total_cents / 100;
  return `${ext.currency} ${n.toFixed(2)}`;
}

// ─── Trailing trailing icon ──────────────────────────────────────────────

function TrailingIcon({ visible, expanded }: { visible: VisibleStatus; expanded: boolean }) {
  if (visible === 'processing') {
    return (
      <View style={styles.trailing}>
        <ActivityIndicator size="small" color={Neutral.textSecondary} />
      </View>
    );
  }
  if (visible === 'saved') {
    return (
      <View style={styles.trailing}>
        <Ionicons name="checkmark-circle" size={20} color={Semantic.success.fg} />
      </View>
    );
  }
  if (visible === 'failed') {
    return (
      <View style={styles.trailing}>
        <Ionicons name="alert-circle" size={20} color={Semantic.error.fg} />
      </View>
    );
  }
  if (visible === 'needs_review') {
    return (
      <View style={styles.trailing}>
        <Ionicons name="alert-circle-outline" size={20} color={Semantic.warning.fg} />
      </View>
    );
  }
  // ready — chevron flips when expanded
  return (
    <View style={styles.trailing}>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={Neutral.textSecondary}
      />
    </View>
  );
}

// ─── Failed actions (§5.2 cause-aware) ───────────────────────────────────

function FailedActions({
  draft,
  onRetryUpload,
  onRetryExtraction,
  onRetrySave,
  onRePick,
  onOpenFullEdit,
  onDiscard,
}: {
  draft: DraftExpense;
  onRetryUpload: (id: string) => void;
  onRetryExtraction: (id: string) => void;
  onRetrySave: (id: string) => void;
  onRePick: (id: string) => void;
  onOpenFullEdit: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const { primary, secondary } = causeAwareActions(draft);

  return (
    <View style={styles.actionsRow}>
      <Button
        label={primary.label}
        size="sm"
        variant="primary"
        onPress={() =>
          primary.handler(draft, { onRetryUpload, onRetryExtraction, onRetrySave, onRePick })
        }
      />
      {secondary.map((s) => (
        <Button
          key={s.label}
          label={s.label}
          size="sm"
          variant="ghost"
          onPress={() =>
            s.handler === 'fullEdit'
              ? onOpenFullEdit(draft.id)
              : s.handler === 'discard'
                ? onDiscard(draft.id)
                : s.handler === 'rePick'
                  ? onRePick(draft.id)
                  : undefined
          }
        />
      ))}
    </View>
  );
}

type RetryRunner = {
  onRetryUpload: (id: string) => void;
  onRetryExtraction: (id: string) => void;
  onRetrySave: (id: string) => void;
  onRePick: (id: string) => void;
};

type SecondaryHandler = 'fullEdit' | 'discard' | 'rePick';

function causeAwareActions(draft: DraftExpense): {
  primary: { label: string; handler: (d: DraftExpense, r: RetryRunner) => void };
  secondary: { label: string; handler: SecondaryHandler }[];
} {
  if (draft.status === 'upload_failed') {
    return {
      primary: { label: 'Retry upload', handler: (d, r) => r.onRetryUpload(d.id) },
      secondary: [
        { label: 'Re-pick', handler: 'rePick' },
        { label: 'Discard', handler: 'discard' },
      ],
    };
  }
  if (draft.status === 'extract_failed') {
    return {
      primary: { label: 'Retry extraction', handler: (d, r) => r.onRetryExtraction(d.id) },
      secondary: [
        { label: 'Open full edit', handler: 'fullEdit' },
        { label: 'Discard', handler: 'discard' },
      ],
    };
  }
  // SAVE_FAILED case — `status: ready` + `reviewState: failed`
  return {
    primary: { label: 'Retry save', handler: (d, r) => r.onRetrySave(d.id) },
    secondary: [
      { label: 'Open full edit', handler: 'fullEdit' },
      { label: 'Discard', handler: 'discard' },
    ],
  };
}

// ─── Expanded editor ─────────────────────────────────────────────────────

function ExpandedEditor({
  draft,
  onApplyEdit,
  onDiscard,
  onOpenFullEdit,
  onCollapse,
}: {
  draft: DraftExpense;
  onApplyEdit: (id: string, patch: Partial<ExtractedExpense>) => void;
  onDiscard: (id: string) => void;
  onOpenFullEdit: (id: string) => void;
  onCollapse: () => void;
}) {
  const ext = draft.extracted;
  const currencyPickerRef = useRef<BottomSheetHandle>(null);
  if (!ext) return null;

  const isCustomCurrency = !QUICK_PICKS.includes(ext.currency as (typeof QUICK_PICKS)[number]);

  return (
    <View style={styles.editor}>
      <TextInput
        label="Merchant"
        value={ext.merchant}
        onChangeText={(merchant) => onApplyEdit(draft.id, { merchant })}
      />

      <CurrencyInput
        label="Total"
        value={BigInt(ext.total_cents)}
        currency={ext.currency}
        onChangeMinor={(minor) => {
          if (minor === null) return;
          onApplyEdit(draft.id, { total_cents: Number(minor) });
        }}
      />

      <TextInput
        label="Date"
        value={ext.expense_date}
        onChangeText={(expense_date) => onApplyEdit(draft.id, { expense_date })}
        helper="YYYY-MM-DD"
      />

      <View>
        <Text variant="caption" color="textSecondary" style={styles.fieldLabel}>
          Currency
        </Text>
        <View style={styles.chipRow}>
          {QUICK_PICKS.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={ext.currency === c}
              onPress={() => onApplyEdit(draft.id, { currency: c })}
            />
          ))}
          <Chip
            label={isCustomCurrency ? ext.currency : 'Other'}
            selected={isCustomCurrency}
            onPress={() => currencyPickerRef.current?.present()}
            accessibilityLabel="Pick another currency"
          />
        </View>
      </View>

      <CurrencyPickerSheet
        ref={currencyPickerRef}
        selectedCode={ext.currency}
        title="Receipt currency"
        onSelect={(code) => {
          onApplyEdit(draft.id, { currency: code });
          currencyPickerRef.current?.dismiss();
        }}
      />

      <View>
        <Text variant="caption" color="textSecondary" style={styles.fieldLabel}>
          Category
        </Text>
        <View style={styles.chipRow}>
          {VISIBLE_CATEGORY_KEYS.map((key) => (
            <Chip
              key={key}
              label={prettyCategory(key)}
              selected={paletteCategory(ext.category_guess) === key}
              leading={<CategoryIcon category={key} size={20} />}
              onPress={() => onApplyEdit(draft.id, { category_guess: key })}
            />
          ))}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Button label="Done" size="sm" variant="primary" onPress={onCollapse} />
        <Button
          label="Open full edit"
          size="sm"
          variant="ghost"
          onPress={() => onOpenFullEdit(draft.id)}
        />
        <Button label="Discard" size="sm" variant="ghost" onPress={() => onDiscard(draft.id)} />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space[12],
    padding: Space[12],
    minHeight: 88,
  },
  rowPressed: {
    backgroundColor: Neutral.canvas,
  },
  body: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space[8],
    minWidth: 0,
  },
  merchant: {
    flex: 1,
    minWidth: 0,
  },
  total: {
    color: Neutral.textPrimary,
  },
  trailing: {
    width: Rhythm.tapTargetMin,
    height: Rhythm.tapTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripChipRow: {
    flexDirection: 'row',
    paddingHorizontal: Space[12],
    paddingBottom: Space[12],
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
    paddingHorizontal: Space[12],
    paddingBottom: Space[12],
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
    paddingTop: Space[12],
  },
  editor: {
    gap: Space[12],
    paddingHorizontal: Space[12],
    paddingTop: Space[12],
    paddingBottom: 0,
    borderTopWidth: 1,
    borderTopColor: Neutral.borderSubtle,
  },
  fieldLabel: {
    marginLeft: 2,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space[8],
  },
});
