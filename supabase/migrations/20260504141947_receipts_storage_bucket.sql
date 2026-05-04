-- Receipts bucket. Private. Path convention: {trip_id}/{uuid}.{ext}.
-- The first folder segment of the object name is the trip_id (uuid),
-- which RLS uses to gate access via the trip's owner.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- SELECT: trip owner can read receipt objects under their trip's folder.
create policy receipts_select_owner
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
    )
  );

-- INSERT: trip owner can upload to their trip's folder.
create policy receipts_insert_owner
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
    )
  );

-- UPDATE (e.g., metadata): trip owner only.
create policy receipts_update_owner
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
    )
  );

-- DELETE: trip owner can delete their trip's receipts.
create policy receipts_delete_owner
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
    )
  );
