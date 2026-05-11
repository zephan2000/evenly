-- M2 splitting (Chunk F).
-- Adds the share_sets / share_set_members / expense_item_splits / audit_log
-- tables (deferred from the core_tables migration), their RLS policies, and
-- the transactional save_expense_splits RPC.
--
-- Math invariant — per docs/specs/m2-splitting.md §9 acceptance: for each
-- expense_item, sum of expense_item_splits.share_amount == item.amount.
-- Proportional service/tip/tax are NOT baked into share_amount; the
-- function returns them separately in the response JSON, mirroring
-- lib/splitting/distribute.ts so client and server stay aligned.

-- ─── share_sets ─────────────────────────────────────────────────────────

create table public.share_sets (
  id                      uuid primary key default gen_random_uuid(),
  trip_id                 uuid not null references public.trips(id) on delete cascade,
  name                    text not null,
  created_from_expense_id uuid references public.expenses(id) on delete set null,
  last_used_at            timestamptz not null default now(),
  created_at              timestamptz not null default now()
);
create index share_sets_trip_last_used_idx
  on public.share_sets (trip_id, last_used_at desc);

-- ─── share_set_members ──────────────────────────────────────────────────

create table public.share_set_members (
  share_set_id   uuid not null references public.share_sets(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  primary key (share_set_id, trip_member_id)
);
create index share_set_members_member_idx on public.share_set_members (trip_member_id);

-- ─── expense_item_splits ────────────────────────────────────────────────
-- One row per (item, member) slice. share_amount is the raw per-item portion
-- in minor units; proportional service/tip/tax are computed on read.

create table public.expense_item_splits (
  id              uuid primary key default gen_random_uuid(),
  expense_item_id uuid not null references public.expense_items(id) on delete cascade,
  trip_member_id  uuid not null references public.trip_members(id) on delete restrict,
  share_amount    bigint not null,
  share_rule      text not null
                    check (share_rule in ('equal_via_share_set','explicit_amount','percentage')),
  share_set_id    uuid references public.share_sets(id) on delete set null
);
create index expense_item_splits_item_idx on public.expense_item_splits (expense_item_id);
create index expense_item_splits_member_idx on public.expense_item_splits (trip_member_id);
create unique index expense_item_splits_item_member_unique
  on public.expense_item_splits (expense_item_id, trip_member_id);

-- ─── audit_log ──────────────────────────────────────────────────────────

create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  actor_member_id uuid references public.trip_members(id) on delete set null,
  action          text not null,
  target_type     text not null,
  target_id       uuid,
  diff            jsonb,
  context         jsonb,
  created_at      timestamptz not null default now()
);
create index audit_log_trip_created_idx on public.audit_log (trip_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────

alter table public.share_sets enable row level security;
alter table public.share_set_members enable row level security;
alter table public.expense_item_splits enable row level security;
alter table public.audit_log enable row level security;

-- Helper predicate: caller owns the trip referenced by trip_id.
-- Inlined into each policy below; written once to keep the SQL terse.

create policy share_sets_select_owner on public.share_sets
  for select using (
    exists (select 1 from public.trips t
             where t.id = share_sets.trip_id
               and t.owner_user_id = public.current_user_id())
  );

create policy share_sets_insert_owner on public.share_sets
  for insert with check (
    exists (select 1 from public.trips t
             where t.id = share_sets.trip_id
               and t.owner_user_id = public.current_user_id())
  );

create policy share_sets_update_owner on public.share_sets
  for update using (
    exists (select 1 from public.trips t
             where t.id = share_sets.trip_id
               and t.owner_user_id = public.current_user_id())
  );

create policy share_set_members_select_owner on public.share_set_members
  for select using (
    exists (select 1
              from public.share_sets s
              join public.trips t on t.id = s.trip_id
             where s.id = share_set_members.share_set_id
               and t.owner_user_id = public.current_user_id())
  );

create policy share_set_members_insert_owner on public.share_set_members
  for insert with check (
    exists (select 1
              from public.share_sets s
              join public.trips t on t.id = s.trip_id
             where s.id = share_set_members.share_set_id
               and t.owner_user_id = public.current_user_id())
  );

create policy share_set_members_delete_owner on public.share_set_members
  for delete using (
    exists (select 1
              from public.share_sets s
              join public.trips t on t.id = s.trip_id
             where s.id = share_set_members.share_set_id
               and t.owner_user_id = public.current_user_id())
  );

create policy expense_item_splits_select_owner on public.expense_item_splits
  for select using (
    exists (select 1
              from public.expense_items ei
              join public.expenses e on e.id = ei.expense_id
              join public.trips t on t.id = e.trip_id
             where ei.id = expense_item_splits.expense_item_id
               and t.owner_user_id = public.current_user_id())
  );

create policy expense_item_splits_insert_owner on public.expense_item_splits
  for insert with check (
    exists (select 1
              from public.expense_items ei
              join public.expenses e on e.id = ei.expense_id
              join public.trips t on t.id = e.trip_id
             where ei.id = expense_item_splits.expense_item_id
               and t.owner_user_id = public.current_user_id())
  );

create policy expense_item_splits_delete_owner on public.expense_item_splits
  for delete using (
    exists (select 1
              from public.expense_items ei
              join public.expenses e on e.id = ei.expense_id
              join public.trips t on t.id = e.trip_id
             where ei.id = expense_item_splits.expense_item_id
               and t.owner_user_id = public.current_user_id())
  );

-- audit_log: owners read their trip's log; writes flow through the
-- save_expense_splits function (which is security invoker; the policy
-- accepts any insert keyed to a trip the caller owns).
create policy audit_log_select_owner on public.audit_log
  for select using (
    exists (select 1 from public.trips t
             where t.id = audit_log.trip_id
               and t.owner_user_id = public.current_user_id())
  );

create policy audit_log_insert_owner on public.audit_log
  for insert with check (
    exists (select 1 from public.trips t
             where t.id = audit_log.trip_id
               and t.owner_user_id = public.current_user_id())
  );

-- ─── save_expense_splits RPC ────────────────────────────────────────────
-- Transactionally replace the splits for one expense. Auto-resolves or
-- creates share_sets by membership. Mirrors lib/splitting/distribute.ts:
-- equal splits with residual cents to leading members; proportional charges
-- with residual cents to the largest-subtotal member (id-asc tie-break).

create or replace function public.save_expense_splits(
  p_expense_id        uuid,
  p_share_groups      jsonb, -- [{ share_set_id, member_ids, item_ids, name }]
  p_individual_panels jsonb  -- [{ item_id, rule, members: [{ member_id, amount }] }]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip_id          uuid;
  v_subtotal         bigint;
  v_service          bigint;
  v_tip              bigint;
  v_tax              bigint;
  v_actor_member_id  uuid;
  v_before           jsonb;
  v_after            jsonb;
  v_group            jsonb;
  v_panel            jsonb;
  v_share_set_id     uuid;
  v_member_ids       uuid[];
  v_item_ids         uuid[];
  v_item_id          uuid;
  v_member_id        uuid;
  v_amount           bigint;
  v_item_amount      bigint;
  v_rule             text;
  v_residual         int;
  v_i                int;
  v_n                int;
  v_member_subtotals jsonb := '{}'::jsonb;
  v_member_charges   jsonb := '{}'::jsonb;
  v_total_subtotal   bigint := 0;
  v_charge_total     bigint := 0;
  v_member_ranked    uuid[];
begin
  -- Resolve expense → trip, and pull the expense-level charges. RLS gates
  -- SELECT to the owner; a non-owner sees no row and we 404 via raise.
  select e.trip_id, e.subtotal, e.service_charge, e.tip, e.tax_amount
    into v_trip_id, v_subtotal, v_service, v_tip, v_tax
    from public.expenses e
   where e.id = p_expense_id and e.deleted_at is null;
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  -- Resolve actor trip_member (owner row in this trip).
  select tm.id into v_actor_member_id
    from public.trip_members tm
    join public.trips t on t.id = tm.trip_id
   where tm.trip_id = v_trip_id
     and t.owner_user_id = public.current_user_id()
     and tm.user_id = public.current_user_id()
   limit 1;

  -- Snapshot existing splits before mutation for the audit diff.
  select coalesce(jsonb_agg(row_to_json(s)::jsonb), '[]'::jsonb)
    into v_before
    from public.expense_item_splits s
    join public.expense_items ei on ei.id = s.expense_item_id
   where ei.expense_id = p_expense_id;

  -- Wipe the old splits. RLS enforces ownership.
  delete from public.expense_item_splits s
   using public.expense_items ei
   where s.expense_item_id = ei.id
     and ei.expense_id = p_expense_id;

  -- ── Share groups ────────────────────────────────────────────────────
  for v_group in select * from jsonb_array_elements(coalesce(p_share_groups, '[]'::jsonb))
  loop
    v_member_ids := array(
      select (m)::uuid
        from jsonb_array_elements_text(v_group -> 'member_ids') m
    );
    v_item_ids := array(
      select (m)::uuid
        from jsonb_array_elements_text(v_group -> 'item_ids') m
    );
    if array_length(v_member_ids, 1) is null then continue; end if;
    if array_length(v_item_ids, 1) is null then continue; end if;

    -- Resolve or create the share_set. Match by exact membership identity.
    v_share_set_id := (v_group ->> 'share_set_id')::uuid;
    if v_share_set_id is null then
      select s.id into v_share_set_id
        from public.share_sets s
       where s.trip_id = v_trip_id
         and (select array_agg(ssm.trip_member_id order by ssm.trip_member_id)
                from public.share_set_members ssm
               where ssm.share_set_id = s.id)
             = (select array_agg(m order by m) from unnest(v_member_ids) m)
       limit 1;
    end if;

    if v_share_set_id is null then
      insert into public.share_sets (trip_id, name, created_from_expense_id)
        values (v_trip_id, coalesce(v_group ->> 'name', 'Share group'), p_expense_id)
      returning id into v_share_set_id;
      insert into public.share_set_members (share_set_id, trip_member_id)
        select v_share_set_id, m from unnest(v_member_ids) m;
    else
      update public.share_sets set last_used_at = now() where id = v_share_set_id;
    end if;

    -- For each item in this group, distribute equally with leading-residual.
    foreach v_item_id in array v_item_ids
    loop
      select ei.amount into v_item_amount
        from public.expense_items ei where ei.id = v_item_id;
      if v_item_amount is null then continue; end if;
      v_n := array_length(v_member_ids, 1);
      v_residual := (v_item_amount - (v_item_amount / v_n) * v_n)::int;
      v_i := 0;
      foreach v_member_id in array v_member_ids
      loop
        v_amount := (v_item_amount / v_n) + (case when v_i < v_residual then 1 else 0 end);
        insert into public.expense_item_splits
              (expense_item_id, trip_member_id, share_amount, share_rule, share_set_id)
        values (v_item_id, v_member_id, v_amount, 'equal_via_share_set', v_share_set_id);
        v_i := v_i + 1;
      end loop;
    end loop;
  end loop;

  -- ── Individual panels ───────────────────────────────────────────────
  for v_panel in select * from jsonb_array_elements(coalesce(p_individual_panels, '[]'::jsonb))
  loop
    v_item_id := (v_panel ->> 'item_id')::uuid;
    v_rule := v_panel ->> 'rule';
    select ei.amount into v_item_amount
      from public.expense_items ei where ei.id = v_item_id;
    if v_item_amount is null then continue; end if;

    if v_rule = 'equal_among_selected' then
      v_member_ids := array(
        select (mem ->> 'member_id')::uuid
          from jsonb_array_elements(v_panel -> 'members') mem
      );
      v_n := array_length(v_member_ids, 1);
      if v_n is null or v_n = 0 then
        raise exception 'panel_no_members' using errcode = 'P0002';
      end if;
      v_residual := (v_item_amount - (v_item_amount / v_n) * v_n)::int;
      v_i := 0;
      foreach v_member_id in array v_member_ids
      loop
        v_amount := (v_item_amount / v_n) + (case when v_i < v_residual then 1 else 0 end);
        insert into public.expense_item_splits
              (expense_item_id, trip_member_id, share_amount, share_rule, share_set_id)
        values (v_item_id, v_member_id, v_amount, 'explicit_amount', null);
        v_i := v_i + 1;
      end loop;
    else
      -- explicit_amount: every member supplies its own amount; trust the
      -- client to balance to item.amount (validated client-side in canSave).
      for v_i in 0..coalesce(jsonb_array_length(v_panel -> 'members'), 0) - 1
      loop
        v_member_id := ((v_panel -> 'members' -> v_i) ->> 'member_id')::uuid;
        v_amount := ((v_panel -> 'members' -> v_i) ->> 'amount')::bigint;
        insert into public.expense_item_splits
              (expense_item_id, trip_member_id, share_amount, share_rule, share_set_id)
        values (v_item_id, v_member_id, v_amount, 'explicit_amount', null);
      end loop;
    end if;
  end loop;

  -- ── Proportional charges (for the response) ─────────────────────────
  -- Compute per-member subtotals from the freshly-inserted splits.
  for v_member_id, v_amount in
    select s.trip_member_id, sum(s.share_amount)::bigint
      from public.expense_item_splits s
      join public.expense_items ei on ei.id = s.expense_item_id
     where ei.expense_id = p_expense_id
     group by s.trip_member_id
  loop
    v_member_subtotals := v_member_subtotals
      || jsonb_build_object(v_member_id::text, v_amount);
    v_total_subtotal := v_total_subtotal + v_amount;
    -- Pre-seed v_member_charges so later jsonb_set has parents to address.
    v_member_charges := v_member_charges || jsonb_build_object(
      v_member_id::text,
      jsonb_build_object('service_charge', 0, 'tip', 0, 'tax_amount', 0)
    );
  end loop;

  -- Distribute each non-item charge proportionally. Residual cents go to
  -- the largest-subtotal member (id-asc tie-break) — mirrors
  -- lib/splitting/distribute.ts.
  declare
    v_charge bigint;
    v_charge_names text[] := array['service_charge','tip','tax_amount'];
    v_charge_vals bigint[] := array[v_service, v_tip, v_tax];
    v_i2 int;
    v_floor bigint;
    v_member_floor jsonb;
  begin
    -- Ranked member list (subtotal desc, id asc) for residual distribution.
    -- Coalesce so a degenerate empty-subtotals input gives an empty array,
    -- not NULL — keeps `foreach ... in array v_member_ranked` safe.
    select coalesce(
             array_agg(member_id order by subtotal desc, member_id asc),
             '{}'::uuid[]
           )
      into v_member_ranked
      from (
        select (key)::uuid as member_id, (value)::bigint as subtotal
          from jsonb_each_text(v_member_subtotals)
      ) ranked;

    for v_i2 in 1..array_length(v_charge_vals, 1)
    loop
      v_charge := v_charge_vals[v_i2];
      v_member_floor := '{}'::jsonb;
      v_charge_total := 0;
      if v_charge > 0 and v_total_subtotal > 0 then
        for v_member_id, v_amount in
          select (key)::uuid, (value)::bigint
            from jsonb_each_text(v_member_subtotals)
        loop
          v_floor := (v_charge * v_amount) / v_total_subtotal;
          v_member_floor := v_member_floor
            || jsonb_build_object(v_member_id::text, v_floor);
          v_charge_total := v_charge_total + v_floor;
        end loop;
        v_residual := (v_charge - v_charge_total)::int;
        v_i := 0;
        while v_residual > 0 and v_i < coalesce(array_length(v_member_ranked, 1), 0) loop
          v_member_id := v_member_ranked[v_i + 1];
          v_member_floor := jsonb_set(
            v_member_floor,
            array[v_member_id::text],
            to_jsonb(((v_member_floor ->> v_member_id::text)::bigint) + 1)
          );
          v_residual := v_residual - 1;
          v_i := v_i + 1;
        end loop;
      elsif v_charge > 0 then
        -- total_subtotal = 0 → equal split among ranked members.
        v_n := coalesce(array_length(v_member_ranked, 1), 0);
        if v_n > 0 then
          v_floor := v_charge / v_n;
          v_residual := (v_charge - v_floor * v_n)::int;
          v_i := 0;
          foreach v_member_id in array v_member_ranked
          loop
            v_member_floor := v_member_floor
              || jsonb_build_object(
                v_member_id::text,
                v_floor + (case when v_i < v_residual then 1 else 0 end)
              );
            v_i := v_i + 1;
          end loop;
        end if;
      end if;
      -- Merge into v_member_charges as { member_id: { service_charge, tip, tax_amount } }
      for v_member_id in select (key)::uuid from jsonb_each(v_member_floor)
      loop
        v_member_charges := jsonb_set(
          v_member_charges,
          array[v_member_id::text, v_charge_names[v_i2]],
          v_member_floor -> v_member_id::text,
          true
        );
      end loop;
    end loop;
  end;

  -- Snapshot the new splits.
  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.expense_item_id, s.trip_member_id), '[]'::jsonb)
    into v_after
    from public.expense_item_splits s
    join public.expense_items ei on ei.id = s.expense_item_id
   where ei.expense_id = p_expense_id;

  -- Audit log entry.
  insert into public.audit_log (
    trip_id, actor_member_id, action, target_type, target_id, diff, context
  ) values (
    v_trip_id,
    v_actor_member_id,
    'split.update',
    'expense',
    p_expense_id,
    jsonb_build_object('before', v_before, 'after', v_after),
    jsonb_build_object('source', 'save_expense_splits')
  );

  return jsonb_build_object(
    'expense_id', p_expense_id,
    'splits', v_after,
    'member_charges', v_member_charges,
    'member_subtotals', v_member_subtotals
  );
end;
$$;

grant execute on function public.save_expense_splits(uuid, jsonb, jsonb) to authenticated;
