-- 20260805001200_history_and_soft_delete  (migration 0012)
--
-- Two ways this app could destroy work irreversibly, closed.
--
-- 1. REGENERATING A BACKGROUND OVERWROTE THE OLD ONE.
--    `slides.background_path` was a single column, so the second click on
--    "Regenerar" replaced a background that may well have been better than what
--    replaced it — with no way back and no warning that it was about to happen.
--    Image generation is non-deterministic, so "just generate it again" does
--    not recover it. Each attempt now gets a row.
--
-- 2. DELETING A BATCH WAS IMMEDIATE AND FINAL.
--    A batch is an afternoon of copy plus several minutes of paid generation,
--    behind one confirm. It is now flagged rather than removed, so the toast
--    can offer Deshacer.

-- ---------------------------------------------------------------------------
-- Background history
-- ---------------------------------------------------------------------------

create table public.slide_backgrounds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slide_id uuid not null references public.slides (id) on delete cascade,

  -- Path in the `generated` bucket. Note these are NOT deleted from Storage
  -- when the row is pruned: an orphaned object costs a fraction of a cent and
  -- a wrongly deleted one costs a regeneration. Reaping is a separate concern.
  storage_path text not null,

  -- Enough to understand and reproduce this attempt.
  prompt text,
  seed bigint,
  provider text,
  model text,

  created_at timestamptz not null default now()
);

comment on table public.slide_backgrounds is
  'Every background ever generated for a slide, newest first. Lets a regeneration be undone.';

create index slide_backgrounds_slide_idx
  on public.slide_backgrounds (slide_id, created_at desc);
create index slide_backgrounds_workspace_idx
  on public.slide_backgrounds (workspace_id);

-- The same background can be restored and re-recorded; one row per path per
-- slide keeps the gallery from filling with duplicates of the same image.
create unique index slide_backgrounds_unique_idx
  on public.slide_backgrounds (slide_id, storage_path);

alter table public.slide_backgrounds enable row level security;

create policy "members read slide backgrounds"
  on public.slide_backgrounds for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create slide backgrounds"
  on public.slide_backgrounds for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members delete slide backgrounds"
  on public.slide_backgrounds for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

-- No UPDATE policy: a generation attempt is a fact. Correcting one means
-- generating again, which is a new row.

-- ---------------------------------------------------------------------------
-- Backfill: the background each slide currently has is its first history entry
-- ---------------------------------------------------------------------------

insert into public.slide_backgrounds (workspace_id, slide_id, storage_path, prompt, seed)
select
  s.workspace_id,
  s.id,
  s.background_path,
  nullif(s.generation_params ->> 'prompt', ''),
  -- generation_params is free-form jsonb written by the client; a non-numeric
  -- seed must not fail the whole migration.
  case
    when s.generation_params ->> 'seed' ~ '^-?[0-9]+$'
      then (s.generation_params ->> 'seed')::bigint
    else null
  end
from public.slides as s
where s.background_path is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Soft delete for batches
-- ---------------------------------------------------------------------------

alter table public.content_batches
  add column deleted_at timestamptz;

comment on column public.content_batches.deleted_at is
  'Set instead of deleting, so the toast can offer Deshacer. Every read filters on it.';

-- Partial: the index only carries live rows, which is what every list query
-- asks for. Deleted ones are read exactly once, by the undo.
create index content_batches_live_idx
  on public.content_batches (workspace_id, created_at desc)
  where deleted_at is null;
