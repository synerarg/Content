-- 20260805000300_fix_storage_policies  (migration 0003)
--
-- Fixes: uploading a logo or a brand font failed with
--   "new row violates row-level security policy"
-- even though inserting the brand row itself succeeded.
--
-- Why the original policy was fragile
-- -----------------------------------
-- The working policies on public.brands use the simple form:
--
--     workspace_id in (select public.current_workspace_ids())
--
-- The storage policies instead used a correlated EXISTS over a set-returning
-- function with a column alias:
--
--     exists (select 1 from public.current_workspace_ids() as w(id)
--             where w.id::text = (storage.foldername(name))[1])
--
-- That form combines three things that are each individually subtle inside a
-- WITH CHECK clause: a set-returning function in the FROM list, a column alias
-- on a scalar SETOF return, and a correlated reference to the NEW row's `name`
-- from inside the subquery.
--
-- The fix removes all three at once rather than betting on which one was at
-- fault: a helper returns a plain text[], and the policy becomes a single
-- `= any(...)` comparison with no subquery, no correlation, and no cast of
-- attacker-controllable text to uuid.

-- ---------------------------------------------------------------------------
-- Membership as a plain array
-- ---------------------------------------------------------------------------

create or replace function public.current_workspace_ids_text()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(workspace_id::text), '{}'::text[])
  from public.workspace_members
  where user_id = (select auth.uid())
$$;

comment on function public.current_workspace_ids_text() is
  'Workspace IDs as text[], for storage.objects policies where a scalar array compares more reliably than a set-returning subquery.';

revoke all on function public.current_workspace_ids_text() from public;
grant execute on function public.current_workspace_ids_text() to authenticated;

-- Re-assert the grant on the original helper too. If the earlier failure was a
-- missing privilege rather than the query shape, this closes that path as well.
grant execute on function public.current_workspace_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Rebuild the brand-assets policies
-- ---------------------------------------------------------------------------

drop policy if exists "workspace members upload brand assets" on storage.objects;
drop policy if exists "workspace members update brand assets" on storage.objects;
drop policy if exists "workspace members delete brand assets" on storage.objects;
drop policy if exists "workspace members read brand assets" on storage.objects;

-- SELECT was missing entirely in 0002. Public-bucket reads go through the
-- public URL and do not consult RLS, which hid the gap — but `upsert: true`
-- makes storage look for an existing row first, and the app needs to list
-- assets. Without this policy those paths see nothing.
create policy "workspace members read brand assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members upload brand assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members update brand assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  )
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members delete brand assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );
