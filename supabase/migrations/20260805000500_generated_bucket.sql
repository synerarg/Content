-- 20260805000500_generated_bucket  (migration 0005)
--
-- Storage for AI-generated backgrounds.
--
-- Private, unlike brand-assets. Brand fonts and logos have to be publicly
-- fetchable because the browser loads them during rendering and export, but a
-- generated background is unpublished client work until the post ships — so it
-- goes behind signed URLs.
--
-- Policies use current_workspace_ids_text() and the `= any(...)` form
-- established in migration 0003. The set-returning-subquery form used in 0002
-- silently evaluated false inside storage policies and broke every upload.

insert into storage.buckets (id, name, public)
values ('generated', 'generated', false)
on conflict (id) do nothing;

drop policy if exists "workspace members read generated" on storage.objects;
drop policy if exists "workspace members upload generated" on storage.objects;
drop policy if exists "workspace members update generated" on storage.objects;
drop policy if exists "workspace members delete generated" on storage.objects;

-- Path convention: {workspace_id}/{brand_id}/backgrounds/{uuid}.png
create policy "workspace members read generated"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'generated'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members upload generated"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'generated'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members update generated"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'generated'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  )
  with check (
    bucket_id = 'generated'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members delete generated"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'generated'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );
