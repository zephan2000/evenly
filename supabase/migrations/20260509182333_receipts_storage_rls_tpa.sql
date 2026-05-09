-- Re-establish receipts storage RLS for Third-Party Auth (Clerk).
--
-- Background: this project's JWT signing was migrated from legacy HS256 to
-- ES256 asymmetric signing keys (Supabase JWT signing keys feature) on
-- 2026-05-04. We then enabled Third-Party Auth with Clerk so Supabase
-- verifies Clerk-issued JWTs via Clerk's JWKS instead of a shared HS256
-- secret. Database RLS on public.trips, public.users, etc. continued to
-- work because those policies just call public.current_user_id() which
-- reads auth.jwt() ->> 'sub' and looks up users.
--
-- Storage object RLS, however, started rejecting authenticated uploads
-- with `new row violates row-level security policy` once Quick capture
-- attempted real receipts uploads. The original policies (receipts bucket
-- migration 20260504141947) did not target an explicit role and were
-- created before the signing-key rotation, so Supabase's storage policy
-- evaluator was holding stale state.
--
-- This migration drops and re-creates all four receipts policies. Two
-- changes from the original:
--
--   1. Each policy is now scoped `to authenticated`. Under TPA the
--      Clerk-injected `role: authenticated` claim maps the request to the
--      `authenticated` Postgres role, so role-targeted policies are the
--      idiomatic fit.
--   2. The trip-ownership EXISTS subquery now also filters out
--      soft-deleted trips (`deleted_at is null`) for parity with the
--      public.trips_select_owner policy.
--
-- The drop-and-recreate also serves as a cache flush: Supabase storage's
-- policy evaluator reloads the new definitions, sidestepping any stale
-- state retained from the pre-TPA configuration.

drop policy if exists receipts_select_owner on storage.objects;
drop policy if exists receipts_insert_owner on storage.objects;
drop policy if exists receipts_update_owner on storage.objects;
drop policy if exists receipts_delete_owner on storage.objects;

-- SELECT: trip owner can read receipt objects under their trip's folder.
create policy receipts_select_owner
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
         and t.deleted_at is null
    )
  );

-- INSERT: trip owner can upload to their trip's folder.
create policy receipts_insert_owner
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
         and t.deleted_at is null
    )
  );

-- UPDATE (e.g., metadata): trip owner only.
create policy receipts_update_owner
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
         and t.deleted_at is null
    )
  );

-- DELETE: trip owner can delete their trip's receipts.
create policy receipts_delete_owner
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
        from public.trips t
       where t.id = ((storage.foldername(name))[1])::uuid
         and t.owner_user_id = public.current_user_id()
         and t.deleted_at is null
    )
  );
