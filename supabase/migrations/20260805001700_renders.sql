-- 20260805001700_renders  (migration 0017)
--
-- The finished placa, as a file that exists outside the browser.
--
-- Until now a rendered slide existed for exactly as long as the tab did: the
-- editor rasterizes in the browser, the ZIP is assembled in the browser, and the
-- bytes go straight to the user's disk. Nothing server-side has ever held the
-- composed image — background plus type plus product plus logo.
--
-- That is the blocker for publishing. Instagram's content-publishing API does
-- not accept bytes for a photo: it takes a URL and fetches it, so the file has
-- to be somewhere reachable at the moment Meta goes looking. It is also what a
-- server-side preview, an email to a client, or any future integration would
-- need. So the render gets persisted.
--
-- ---------------------------------------------------------------------------
-- A separate bucket, not `generated`
-- ---------------------------------------------------------------------------
--
-- `generated` carries an invariant worth keeping, written into migration 0007:
-- "Nothing user-supplied reaches this bucket: the only writer is
-- /api/generate/image, copying provider bytes straight into Storage." Its 10 MB
-- cap is described there as a blast radius rather than a validation, precisely
-- because no browser can write to it.
--
-- A render is written BY THE BROWSER — it is the only place the composed pixels
-- exist. Putting it in `generated` would quietly turn that limit into a
-- validation surface and make the comment false. A second bucket keeps both
-- statements true and lets renders have their own ceiling.

insert into storage.buckets (id, name, public)
values ('renders', 'renders', false)
on conflict (id) do nothing;

-- Private, like `generated` and for the same reason: an unpublished piece is
-- client work. Reads go through signed URLs, which is also exactly the shape
-- Meta needs — a URL that is fetchable without a session, for a bounded window.
update storage.buckets
set
  file_size_limit = 15728640, -- 15 MiB
  allowed_mime_types = array['image/png']
where id = 'renders';

-- 15 MB against a real payload of ~1-3 MB. A 1080x1920 story with a
-- photographic background is the worst case and lands nowhere near it; the
-- headroom is there so a future higher-resolution format does not start failing
-- silently. PNG only — this bucket has exactly one writer and it produces PNG.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
--
-- `current_workspace_ids_text()` and the `= any(...)` form, per migration 0003.
-- The set-returning-subquery form used in 0002 silently evaluates false inside
-- storage policies and breaks every upload — it looks correct and is not.

drop policy if exists "workspace members read renders" on storage.objects;
drop policy if exists "workspace members upload renders" on storage.objects;
drop policy if exists "workspace members update renders" on storage.objects;
drop policy if exists "workspace members delete renders" on storage.objects;

-- Path convention: {workspace_id}/{brand_id}/{slide_id}/{uuid}.png
create policy "workspace members read renders"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'renders'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members upload renders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'renders'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members update renders"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'renders'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  )
  with check (
    bucket_id = 'renders'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

create policy "workspace members delete renders"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'renders'
    and (storage.foldername(name))[1] = any (public.current_workspace_ids_text())
  );

-- ---------------------------------------------------------------------------
-- What each slide currently has rendered
-- ---------------------------------------------------------------------------

alter table public.slides
  add column if not exists render_path text,
  add column if not exists rendered_at timestamptz,
  add column if not exists render_fingerprint text;

comment on column public.slides.render_path is
  'Object path in the `renders` bucket for the last persisted PNG of this slide.';

comment on column public.slides.rendered_at is
  'When that PNG was written. Shown to the user; also how a stale render is spotted by eye.';

-- The fingerprint is the reason this is not just a path.
--
-- A render is a photograph of the slide AT A MOMENT. Edit the headline, swap the
-- background, change the brand's palette, and the stored PNG is now a picture of
-- something that no longer exists — while still being a perfectly valid file at
-- a perfectly valid URL. Publishing it would put yesterday's copy on the
-- client's feed, and nothing about the file itself would say so.
--
-- So the inputs that determine the pixels are hashed and stored alongside. When
-- the current hash differs from this one, the render is stale and the UI says
-- so instead of offering it. See lib/export/render-fingerprint.ts for exactly
-- what is covered — and, importantly, what is not.
comment on column public.slides.render_fingerprint is
  'Hash of the inputs that determined those pixels. Differs from the current hash => the render is stale.';
