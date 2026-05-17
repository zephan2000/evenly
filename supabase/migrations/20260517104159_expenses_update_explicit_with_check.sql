-- Make the expenses UPDATE policy's WITH CHECK explicit.
--
-- Context: `expenses_update_trip_owner` previously declared only USING and
-- no explicit WITH CHECK, so Postgres defaulted WITH CHECK := USING. That
-- was behaviourally fine for the UPDATE itself, but left intent implicit
-- and the policy fragile: an UPDATE that changed `trip_id` would only be
-- re-checked because of the implicit default. Making WITH CHECK explicit
-- guarantees a post-update row must still belong to a trip the caller owns
-- (blocks moving an expense into someone else's trip).
--
-- IMPORTANT: the WITH CHECK must NOT include `deleted_at is null`. Soft
-- delete sets `deleted_at = now()`; a `deleted_at is null` predicate here
-- would reject the owner's own soft-delete at the row-modification check.
--
-- Note: this migration is NOT what fixed the soft-delete 500. That 500
-- ("new row violates row-level security policy for table expenses") was
-- caused by the API handler emitting `RETURNING` — via PostgREST
-- `.select()` AND via `{ count: 'exact' }` (PostgREST counts with
-- `WITH s AS (UPDATE ... RETURNING *) SELECT count(*) FROM s`) — which
-- makes Postgres re-apply the SELECT policy (expenses_select_trip_owner,
-- which DOES carry `deleted_at is null`) to the post-update row. It is
-- fixed in api/expenses/[id].ts with a pre-check SELECT plus a bare
-- UPDATE (no .select(), no count → return=minimal, zero RETURNING).
-- This migration is defence-in-depth + explicit intent only.

drop policy if exists expenses_update_trip_owner on public.expenses;

create policy expenses_update_trip_owner on public.expenses
  for update
  using (
    exists (
      select 1
        from public.trips t
       where t.id = expenses.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  )
  with check (
    exists (
      select 1
        from public.trips t
       where t.id = expenses.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );
