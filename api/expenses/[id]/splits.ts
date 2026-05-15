// /api/expenses/[id]/splits
//   GET  — returns the current expense_item_splits for an expense, joined
//          with share_set + member references. Used by the C7 screen to
//          hydrate when revisiting an already-split expense.
//   POST — replaces the splits via the save_expense_splits RPC. Body shape
//          mirrors lib/splitting/state.ts's draft + the SQL function's
//          input contract.
//
// Auth mirrors /api/expenses+api.ts POST: validate Clerk JWT, upsert
// public.users for RLS, then call through createUserClient. The RPC is
// security invoker, so ownership is gated by RLS on every table it touches.

import { z } from 'zod';

import {
  decodeJwtClaims,
  getJwtFromRequest,
  upsertUserOnFirstSeen,
} from '../../../lib/auth/server';
import { createUserClient } from '../../../lib/db/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Request schema ──────────────────────────────────────────────────────

// bigint is JSON-encoded as a number string here — the reducer's amount
// fields are bigints but JSON can't carry them natively. The server casts
// back to bigint in plpgsql via ::bigint.
const AmountSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

const ShareGroupInputSchema = z.object({
  share_set_id: z.string().uuid().nullable(),
  member_ids: z.array(z.string().uuid()).min(1),
  item_ids: z.array(z.string().uuid()).min(1),
  name: z.string().optional(),
});

const PanelMemberSchema = z.object({
  member_id: z.string().uuid(),
  amount: AmountSchema,
});

const IndividualPanelSchema = z.object({
  item_id: z.string().uuid(),
  rule: z.enum(['equal_among_selected', 'explicit_amount']),
  members: z.array(PanelMemberSchema).min(1),
});

const SaveSplitsRequestSchema = z.object({
  share_groups: z.array(ShareGroupInputSchema),
  individual_panels: z.array(IndividualPanelSchema),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function extractExpenseId(request: Request): string | null {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // .../api/expenses/{id}/splits
  const idx = segments.indexOf('expenses');
  if (idx < 0) return null;
  const candidate = segments[idx + 1];
  return candidate && UUID_RE.test(candidate) ? candidate : null;
}

async function authed(request: Request) {
  const auth = getJwtFromRequest(request);
  if (!auth.ok) return { ok: false as const, status: 401, error: auth.error.kind };

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) return { ok: false as const, status: 401, error: 'invalid_jwt' };

  await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  return { ok: true as const, jwt: auth.jwt };
}

// ─── GET ─────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const a = await authed(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  const expenseId = extractExpenseId(request);
  if (!expenseId) return Response.json({ ok: false, error: 'invalid_expense_id' }, { status: 400 });

  const client = createUserClient(a.jwt);

  // expense_item_splits is added in the 20260511 migration; the generated
  // database.types.ts won't reference it until `npm run db:types` runs
  // post-migration. The untyped client view bypasses strict typing —
  // runtime behavior is unaffected.
  const untyped = client as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
  const { data, error } = await untyped
    .from('expense_item_splits')
    .select(
      [
        'id',
        'expense_item_id',
        'trip_member_id',
        'share_amount',
        'share_rule',
        'share_set_id',
        'expense_items!inner(expense_id)',
      ].join(', '),
    )
    .eq('expense_items.expense_id', expenseId);

  if (error) {
    return Response.json(
      { ok: false, error: 'fetch_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, splits: data ?? [] }, { status: 200 });
}

// ─── POST ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const a = await authed(request);
  if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });

  const expenseId = extractExpenseId(request);
  if (!expenseId) return Response.json({ ok: false, error: 'invalid_expense_id' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = SaveSplitsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const client = createUserClient(a.jwt);
  // save_expense_splits is added in the 20260511 migration; the generated
  // database.types.ts will pick it up after `npm run db:types`. Until
  // then, route through an untyped rpc view.
  const untyped = client as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await untyped.rpc('save_expense_splits', {
    p_expense_id: expenseId,
    p_share_groups: parsed.data.share_groups,
    p_individual_panels: parsed.data.individual_panels,
  });

  if (error) {
    // P0002 = our custom "expense_not_found" raise. The function also
    // bubbles up panel_no_members for an invalid equal-split panel.
    const code = (error as { code?: string }).code;
    const status = code === 'P0002' ? 404 : 500;
    return Response.json({ ok: false, error: 'save_failed', detail: error.message }, { status });
  }

  return Response.json({ ok: true, ...(data as Record<string, unknown>) }, { status: 200 });
}
