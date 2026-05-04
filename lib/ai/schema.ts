import { z } from 'zod';

export const TAX_MODES_AI = ['inclusive', 'exclusive', 'none'] as const;
export const TAX_MODES_PERSISTED = ['inclusive', 'exclusive'] as const;

export const CATEGORIES = [
  'meals',
  'transport',
  'lodging',
  'entertainment',
  'groceries',
  'shopping',
  'other',
] as const;

const ItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit_amount_cents: z.number().int(),
  amount_cents: z.number().int(),
});

const ConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  items: z.number().min(0).max(1),
  totals: z.number().min(0).max(1),
});

export const ExtractedExpenseSchema = z.object({
  merchant: z.string(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  tax_mode: z.enum(TAX_MODES_AI),
  tax_label: z.string(),
  items: z.array(ItemSchema),
  subtotal_cents: z.number().int(),
  service_charge_cents: z.number().int(),
  tip_cents: z.number().int(),
  tax_amount_cents: z.number().int(),
  total_cents: z.number().int(),
  category_guess: z.enum(CATEGORIES),
  confidence: ConfidenceSchema,
  notes: z.string(),
});

export type ExtractedExpense = z.infer<typeof ExtractedExpenseSchema>;

export const PersistedExpenseSchema = ExtractedExpenseSchema.extend({
  tax_mode: z.enum(TAX_MODES_PERSISTED),
});

export type PersistedExpense = z.infer<typeof PersistedExpenseSchema>;
