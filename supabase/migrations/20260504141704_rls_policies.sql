-- Row-level security for milestone-1 tables.
-- Owner-only access path. Member-of-trip and anonymous-member-via-share-token
-- policies are deferred (added when the share-link join flow lands).

-- Helper: resolve the active Clerk JWT's sub claim to a public.users.id.
-- security definer + locked search_path so the function reads users table
-- regardless of caller's RLS context, with no schema-spoofing surface.
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from public.users u
   where u.clerk_user_id = auth.jwt() ->> 'sub'
   limit 1
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to authenticated, anon;

-- USERS: read self only. INSERT/UPDATE flow exclusively through the
-- service-role client (admin upsert on first sign-in).
alter table public.users enable row level security;

create policy users_select_self on public.users
  for select
  using (id = public.current_user_id());

-- TRIPS: owner-only for milestone 1.
alter table public.trips enable row level security;

create policy trips_select_owner on public.trips
  for select
  using (owner_user_id = public.current_user_id() and deleted_at is null);

create policy trips_insert_owner on public.trips
  for insert
  with check (owner_user_id = public.current_user_id());

create policy trips_update_owner on public.trips
  for update
  using (owner_user_id = public.current_user_id())
  with check (owner_user_id = public.current_user_id());

-- TRIP_MEMBERS: owner sees and writes; member-self-access deferred.
alter table public.trip_members enable row level security;

create policy trip_members_select_owner on public.trip_members
  for select
  using (
    exists (
      select 1
        from public.trips t
       where t.id = trip_members.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy trip_members_insert_owner on public.trip_members
  for insert
  with check (
    exists (
      select 1
        from public.trips t
       where t.id = trip_members.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy trip_members_update_owner on public.trip_members
  for update
  using (
    exists (
      select 1
        from public.trips t
       where t.id = trip_members.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

-- EXPENSES: any member of a trip can read/write in casual mode.
-- Milestone 1 has only the owner, so we gate on owner directly.
alter table public.expenses enable row level security;

create policy expenses_select_trip_owner on public.expenses
  for select
  using (
    deleted_at is null
    and exists (
      select 1
        from public.trips t
       where t.id = expenses.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy expenses_insert_trip_owner on public.expenses
  for insert
  with check (
    exists (
      select 1
        from public.trips t
       where t.id = expenses.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy expenses_update_trip_owner on public.expenses
  for update
  using (
    exists (
      select 1
        from public.trips t
       where t.id = expenses.trip_id
         and t.owner_user_id = public.current_user_id()
    )
  );

-- EXPENSE_ITEMS: same scope as their parent expense.
alter table public.expense_items enable row level security;

create policy expense_items_select_trip_owner on public.expense_items
  for select
  using (
    exists (
      select 1
        from public.expenses e
        join public.trips t on t.id = e.trip_id
       where e.id = expense_items.expense_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy expense_items_insert_trip_owner on public.expense_items
  for insert
  with check (
    exists (
      select 1
        from public.expenses e
        join public.trips t on t.id = e.trip_id
       where e.id = expense_items.expense_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy expense_items_update_trip_owner on public.expense_items
  for update
  using (
    exists (
      select 1
        from public.expenses e
        join public.trips t on t.id = e.trip_id
       where e.id = expense_items.expense_id
         and t.owner_user_id = public.current_user_id()
    )
  );

create policy expense_items_delete_trip_owner on public.expense_items
  for delete
  using (
    exists (
      select 1
        from public.expenses e
        join public.trips t on t.id = e.trip_id
       where e.id = expense_items.expense_id
         and t.owner_user_id = public.current_user_id()
    )
  );
