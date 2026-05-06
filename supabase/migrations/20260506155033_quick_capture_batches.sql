-- Quick capture (M1.5) — batch upload of up to 8 receipts in one workspace.
-- Spec authority: docs/specs/quick-capture.md (§6 data model, §16 cross-trip support).
--
-- Design notes:
-- - No `trip_id` on the batch row: a batch may legitimately span trips when the
--   user opts into per-receipt trip mode. Trip stays per `expenses` row.
-- - Owner-scoped only. Trip members read individual `expenses` via existing RLS;
--   they don't need batch metadata.
-- - `expenses.quick_capture_batch_id` is nullable so existing rows and the
--   single-receipt flow remain unaffected. Existing `expenses` RLS continues to
--   gate by trip membership and is intentionally left untouched here.

create table public.quick_capture_batches (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  image_count   int not null check (image_count between 1 and 8),
  confirmed_at  timestamptz,
  discarded_at  timestamptz
);

create index quick_capture_batches_owner_user_id_idx
  on public.quick_capture_batches (owner_user_id);

alter table public.expenses
  add column quick_capture_batch_id uuid
    references public.quick_capture_batches(id) on delete set null;

create index expenses_quick_capture_batch_id_idx
  on public.expenses (quick_capture_batch_id)
  where quick_capture_batch_id is not null;

alter table public.quick_capture_batches enable row level security;

create policy quick_capture_batches_select_owner on public.quick_capture_batches
  for select
  using (owner_user_id = public.current_user_id());

create policy quick_capture_batches_insert_owner on public.quick_capture_batches
  for insert
  with check (owner_user_id = public.current_user_id());

create policy quick_capture_batches_update_owner on public.quick_capture_batches
  for update
  using (owner_user_id = public.current_user_id())
  with check (owner_user_id = public.current_user_id());

create policy quick_capture_batches_delete_owner on public.quick_capture_batches
  for delete
  using (owner_user_id = public.current_user_id());
