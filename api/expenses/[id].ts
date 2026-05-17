// GET /api/expenses/[id] — fetches one saved expense with its line items
// for the C6 detail screen.
//
// Auth + ownership model mirrors /api/upload: validate the Clerk JWT,
// upsert the public.users row so RLS resolves, then query through the
// user-scoped Supabase client. The expenses + expense_items RLS policies
// limit visibility to trip members; a missing row reads as 404.

import { decodeJwtClaims, getJwtFromRequest, upsertUserOnFirstSeen } from '../../lib/auth/server';
import { createUserClient } from '../../lib/db/server';

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
  // Join trips.home_currency so the split-screen breakdown can render
  // amounts in either the receipt's original_currency or the trip's
  // home (settlement) currency without a second round-trip.
  const { data: expenseRow, error: expenseErr } = await client
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
        'trips!inner(home_currency)',
      ].join(', '),
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  // Flatten the joined trips.home_currency into a top-level field; the
  // client expects ExpenseRecord-shaped rows + a sibling home_currency.
  // The supabase-js generated type is wider than what we actually return,
  // so cast at this boundary.
  const expense = expenseRow
    ? (() => {
        const raw = expenseRow as unknown as Record<string, unknown> & {
          trips?: { home_currency?: string } | { home_currency?: string }[] | null;
        };
        const tripRow = Array.isArray(raw.trips) ? raw.trips[0] : raw.trips;
        const { trips: _trips, ...rest } = raw;
        return { ...rest, home_currency: tripRow?.home_currency ?? null };
      })()
    : null;

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

// DELETE /api/expenses/[id] — soft-delete by setting deleted_at = now().
// The undo window is enforced client-side: the UI shows an undo toast for
// ~5s, and the actual DELETE fetch is held until the toast expires. If the
// user taps Undo, the fetch is cancelled — no server round-trip happens, no
// row was ever touched. This keeps the server simple (no resurrection
// endpoint, no TTL bookkeeping) and matches the ux-principles guidance to
// 'undo over confirm.'
//
// Server-side undo (post-undo-window) is not supported. If the user reloads
// or closes the tab during the window, the toast disappears and the delete
// fires on the next time the queued task drains; if the tab is killed
// outright before the fetch, the delete is silently dropped — the row stays.
// That's acceptable: the deletion is a user intent that requires their
// continued presence to commit.

export async function DELETE(request: Request) {
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

  // Soft-delete must emit ZERO `RETURNING`. Any RETURNING — including the
  // CTE PostgREST builds for `.select()` AND for `{ count: 'exact' }`
  // (`WITH s AS (UPDATE ... RETURNING *) SELECT count(*) FROM s`) — makes
  // Postgres re-apply the SELECT policy (expenses_select_trip_owner, which
  // carries `deleted_at is null`) to the post-update row, which now has
  // deleted_at set, raising "new row violates row-level security policy
  // for table expenses" (500).
  //
  // So: (1) a pre-check SELECT (gated by the same SELECT policy) decides
  // not-found/forbidden — null for non-owners or already-deleted rows, so
  // we don't leak presence — then (2) a bare UPDATE with no `.select()`
  // and no count → PostgREST `return=minimal` → plain `UPDATE`, no
  // RETURNING, SELECT policy never touches the soft-deleted row. A delete
  // racing in between just no-ops the UPDATE; the outcome is still deleted.
  const { data: target, error: findErr } = await client
    .from('expenses')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) {
    return Response.json(
      { ok: false, error: 'delete_failed', detail: findErr.message },
      { status: 500 },
    );
  }
  if (!target) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const { error } = await client
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    return Response.json(
      { ok: false, error: 'delete_failed', detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
