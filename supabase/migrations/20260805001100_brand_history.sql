-- 20260805001100_brand_history  (migration 0011)
--
-- What a brand has already published, and the angles extracted from it.
--
-- Purpose: stop the generator from repeating itself. Measured, not assumed —
-- three consecutive batches on the same brief produced a story titled "Tu
-- competencia ya tiene web" while the brand had already published exactly that
-- argument, and one produced "Un catálogo de fotos no cobra" against a
-- published caption reading "no es un catálogo de fotos". Without a record of
-- what went out, the generator has no way to know.
--
-- WHY A TABLE FOR POSTS AND A COLUMN FOR THE ANALYSIS
--
-- Published posts are entities: each has an origin, its own id at that origin,
-- a publish date, and its own lifecycle (imported, re-synced, removed). They
-- are also deduplicated against, which needs a key.
--
-- The analysis is a document. It is derived from those rows, read whole
-- alongside the brand, and never filtered, joined or aggregated on — nothing
-- asks "which brands use the competencia angle". Same reasoning that put
-- palette, typography and art_direction on `brands` as jsonb in migration 0002.

create type public.published_post_source as enum (
  'manual',     -- pasted in by hand
  'instagram',  -- Instagram Graph API (not built yet)
  'meta_ads'    -- ad creative copy from the Marketing API
);

create table public.brand_published_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  source public.published_post_source not null default 'manual',

  -- The id at the origin, when there is one. Null for pasted text. This is what
  -- makes a future re-sync idempotent instead of duplicating the whole history.
  external_id text,

  caption text not null check (char_length(btrim(caption)) between 1 and 5000),
  permalink text,
  published_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.brand_published_posts is
  'Content this brand has already published. Feeds the angle analysis so new batches do not repeat it.';

create index brand_published_posts_workspace_id_idx
  on public.brand_published_posts (workspace_id);
create index brand_published_posts_brand_id_idx
  on public.brand_published_posts (brand_id, published_at desc nulls last);

-- Re-syncing a source must update in place, never append a second copy.
-- Partial, because pasted rows have no external id and would otherwise all
-- collide on null.
create unique index brand_published_posts_external_unique_idx
  on public.brand_published_posts (brand_id, source, external_id)
  where external_id is not null;

-- Pasting the same block twice is the likely human error, and it is invisible
-- once the list is long. Hashed rather than compared directly because captions
-- run to thousands of characters and a btree index on the text itself would be
-- both large and subject to the index row size limit.
create unique index brand_published_posts_caption_unique_idx
  on public.brand_published_posts (brand_id, md5(caption));

-- ---------------------------------------------------------------------------
-- The extracted analysis, on the brand
-- ---------------------------------------------------------------------------

alter table public.brands
  add column content_analysis jsonb not null default '{}'::jsonb,
  -- Null means never analysed. Compared against the newest post to tell the
  -- user their analysis is stale without re-running it on every page load.
  add column content_analysis_at timestamptz,
  add constraint brands_content_analysis_is_object
    check (jsonb_typeof(content_analysis) = 'object');

comment on column public.brands.content_analysis is
  'Angles, hooks and phrases already used, extracted from brand_published_posts. Fed to the batch prompt as prohibitions.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.brand_published_posts enable row level security;

create policy "members read published posts"
  on public.brand_published_posts for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create published posts"
  on public.brand_published_posts for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members update published posts"
  on public.brand_published_posts for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members delete published posts"
  on public.brand_published_posts for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
