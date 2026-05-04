-- Core tables for the scan + key + save milestone.
-- Schema authority: docs/data-model.md.
-- Tables deferred to later migrations: share_sets, share_set_members,
-- expense_item_splits, settlements, fx_rates, audit_log.

-- USERS: mirrors authenticated Clerk users (one row per Clerk user).
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  display_name  text,
  email         text,
  created_at    timestamptz not null default now()
);

-- TRIPS: top-level container; owner is always Clerk-authenticated.
create table public.trips (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  home_currency          char(3) not null,
  owner_user_id          uuid not null references public.users(id) on delete restrict,
  auth_mode              text not null default 'casual'
                           check (auth_mode in ('casual', 'strict')),
  share_token            text not null unique
                           default replace(gen_random_uuid()::text, '-', ''),
  share_token_rotated_at timestamptz,
  created_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index trips_owner_user_id_idx on public.trips (owner_user_id)
  where deleted_at is null;

-- TRIP_MEMBERS: anyone associated with a trip (authenticated or anonymous).
-- Anonymous-member columns are present in schema even though the milestone-1
-- flow only writes authenticated members; avoids a structural migration when
-- share-link join lands.
create table public.trip_members (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips(id) on delete cascade,
  user_id          uuid references public.users(id) on delete restrict,
  anon_id          uuid,
  display_name     text not null,
  user_agent       text,
  device_locale    text,
  timezone         text,
  geo_city         text,
  fingerprint_hash text,
  joined_at        timestamptz not null default now(),
  claimed_at       timestamptz,
  constraint trip_members_identity_check check (
    (user_id is not null and anon_id is null) or
    (user_id is null and anon_id is not null)
  )
);
create unique index trip_members_trip_display_name_idx
  on public.trip_members (trip_id, lower(display_name));
create unique index trip_members_trip_anon_id_idx
  on public.trip_members (trip_id, anon_id) where anon_id is not null;
create unique index trip_members_trip_user_id_idx
  on public.trip_members (trip_id, user_id) where user_id is not null;

-- EXPENSES: one row per expense; FX columns nullable (FX flow ships post-MVP).
-- tax_mode persists as the two-valued enum after the AI parser collapses
-- "none" -> "inclusive" with tax_amount = 0 (see docs/ai-prompts.md).
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete cascade,
  payer_member_id      uuid not null references public.trip_members(id) on delete restrict,
  merchant             text,
  expense_date         date not null default current_date,
  category             text not null
                         check (category in ('meals','transport','lodging','entertainment','groceries','shopping','other')),
  original_amount      bigint not null,
  original_currency    char(3) not null,
  fx_rate              numeric(18,8),
  fx_rate_status       text check (fx_rate_status in ('fresh','stale','updated')),
  home_amount          bigint,
  subtotal             bigint not null default 0,
  service_charge       bigint not null default 0,
  tip                  bigint not null default 0,
  tax_amount           bigint not null default 0,
  tax_mode             text not null
                         check (tax_mode in ('inclusive','exclusive')),
  tax_label            text,
  receipt_image_path   text,
  notes                text,
  created_by_member_id uuid not null references public.trip_members(id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index expenses_trip_id_idx on public.expenses (trip_id) where deleted_at is null;
create index expenses_payer_member_idx on public.expenses (payer_member_id);

-- EXPENSE_ITEMS: line items extracted from receipts.
create table public.expense_items (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  name        text not null,
  quantity    numeric not null default 1,
  unit_amount bigint not null,
  amount      bigint not null,
  sort_order  int not null default 0
);
create index expense_items_expense_id_idx on public.expense_items (expense_id);

-- updated_at trigger for expenses.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.update_updated_at();
