// GET /api/expenses/[id] — fetches one saved expense with its line items
// for the C6 detail screen.
//
// Auth + ownership model mirrors /api/upload: validate the Clerk JWT,
// upsert the public.users row so RLS resolves, then query through the
// user-scoped Supabase client. The expenses + expense_items RLS policies
// limit visibility to trip members; a missing row reads as 404.

import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '@/lib/auth/server';
import { createUserClient } from '@/lib/db/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  // Pull the [id] segment out of the URL — Expo Router on Vercel doesn't
  // pass a typed params arg the way Next.js does, so we parse from
  // request.url. The route is /api/expenses/{id}.
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];

  if (!id || !UUID_RE.test(id)) {
    return Response.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const auth = getJwtFromRequest(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error.kind }, { status: 401 });
  }

  const claims = decodeJwtClaims(auth.jwt);
  if (!claims?.sub) {
    return Response.json({ ok: false, error: 'invalid_jwt' }, { status: 401 });
  }

  await upsertUserOnFirstSeen({
    clerkUserId: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  });

  const client = createUserClient(auth.jwt);
  const { data: expense, error: expenseErr } = await client
    .from('expenses')
    .select(
      [
        'id',
        'trip_id',
        'merchant',
        'expense_date',
        'category',
        'original_amount',
        'original_currency',
        'fx_rate',
        'fx_rate_status',
        'home_amount',
        'subtotal',
        'service_charge',
        'tip',
        'tax_amount',
        'tax_mode',
        'tax_label',
        'receipt_image_path',
        'notes',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (expenseErr) {
    return Response.json(
      { ok: false, error: 'fetch_failed', detail: expenseErr.message },
      { status: 500 },
    );
  }
  if (!expense) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await client
    .from('expense_items')
    .select('id, name, quantity, unit_amount, amount, sort_order')
    .eq('expense_id', id)
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    return Response.json(
      { ok: false, error: 'items_fetch_failed', detail: itemsErr.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, expense, items: items ?? [] }, { status: 200 });
}
