-- 20260805000600_batches  (migration 0006)
--
-- Content batches -> posts -> slides.
--
-- Every table carries its own workspace_id even though it could be derived by
-- walking the parent chain. That denormalisation is the point: a policy on
-- `slides` that joined slides -> posts -> batches -> brands to find the tenant
-- would run that join for every candidate row.

create type public.post_type as enum ('feed', 'story', 'carousel');
create type public.batch_status as enum ('draft', 'generating', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------

create table public.content_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  title text not null check (char_length(btrim(title)) between 1 and 200),
  brief text not null default '',
  status public.batch_status not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_batches is
  'A production run: one brief in, several posts out.';

create index content_batches_workspace_id_idx on public.content_batches (workspace_id);
create index content_batches_brand_id_idx on public.content_batches (brand_id);
create index content_batches_created_at_idx on public.content_batches (created_at desc);

create trigger content_batches_set_updated_at
  before update on public.content_batches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  batch_id uuid not null references public.content_batches (id) on delete cascade,

  position int not null default 0,
  type public.post_type not null,

  caption text not null default '',
  hashtags text[] not null default '{}',
  cta text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.posts is
  'One publishable unit. A feed post or story has one slide; a carousel has several.';

create index posts_workspace_id_idx on public.posts (workspace_id);
create index posts_batch_id_idx on public.posts (batch_id);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Slides
-- ---------------------------------------------------------------------------

create table public.slides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,

  position int not null default 0,
  template_slug text not null,
  format text not null default 'feed' check (format in ('feed', 'story')),

  -- { headline: "...", subline: "..." } — validated in code against the
  -- template's own zod schema, which is the source of truth for slot names.
  slots jsonb not null default '{}'::jsonb,

  /* Path in the `generated` bucket. Null renders on the brand's bg token. */
  background_path text,

  /*
    Everything needed to reproduce this background: prompt, seed, model,
    provider, size. Carousel slides deliberately share a seed so their
    backgrounds read as one set rather than three unrelated photos.
  */
  generation_params jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint slides_slots_is_object check (jsonb_typeof(slots) = 'object'),
  unique (post_id, position)
);

comment on table public.slides is
  'One rendered image. Stores the template, its text slots, and how the background was made.';

create index slides_workspace_id_idx on public.slides (workspace_id);
create index slides_post_id_idx on public.slides (post_id);

create trigger slides_set_updated_at
  before update on public.slides
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.content_batches enable row level security;
alter table public.posts enable row level security;
alter table public.slides enable row level security;

create policy "members read batches" on public.content_batches
  for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
create policy "members create batches" on public.content_batches
  for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members update batches" on public.content_batches
  for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members delete batches" on public.content_batches
  for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members read posts" on public.posts
  for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
create policy "members create posts" on public.posts
  for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members update posts" on public.posts
  for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members delete posts" on public.posts
  for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members read slides" on public.slides
  for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
create policy "members create slides" on public.slides
  for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members update slides" on public.slides
  for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));
create policy "members delete slides" on public.slides
  for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
