-- 20260805000200_brands  (migration 0002)
--
-- Brand Kits: the per-client design and voice system that everything
-- downstream reads from.
--
-- On the jsonb-vs-tables split:
--
--   palette, typography and art_direction are jsonb because they are always
--   read as a whole unit alongside the brand and are never filtered, joined,
--   sorted or aggregated on. Nothing in this product asks "which brands use
--   #84E9FF". Splitting them into rows would buy referential integrity we never
--   exercise, at the cost of a join on every render and a migration every time
--   the design system grows a token.
--
--   brand_fonts IS a table, because each row is a stored file with a path, a
--   weight, a style and its own lifecycle. That is an entity, not a property
--   bag.

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,

  name text not null check (char_length(btrim(name)) between 1 and 120),
  tagline text,
  logo_path text,

  -- { "primary": "#84E9FF", "bg": "#0B0D10", "fg": "#F5F7FA", ... }
  palette jsonb not null default '{}'::jsonb,

  -- { "display": { "family": "Poppins", "weight": 700 },
  --   "body":    { "family": "Poppins", "weight": 400 } }
  typography jsonb not null default '{}'::jsonb,

  tone_of_voice text,
  target_audience text,
  example_captions text[] not null default '{}',

  -- { "photographic_style": "...", "lighting": "...",
  --   "palette_notes": "...", "avoid": ["texto", "logos"] }
  art_direction jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- These are read as documents, never as scalars. Enforcing object-ness here
  -- means the render path can trust the shape instead of defensively checking.
  constraint brands_palette_is_object check (jsonb_typeof(palette) = 'object'),
  constraint brands_typography_is_object check (jsonb_typeof(typography) = 'object'),
  constraint brands_art_direction_is_object check (jsonb_typeof(art_direction) = 'object')
);

comment on table public.brands is
  'Per-client Brand Kit. Feeds both copy generation (tone, audience) and rendering (palette, typography).';

create index brands_workspace_id_idx on public.brands (workspace_id);

-- One brand name per workspace, case-insensitively. Two "Synera" brands in the
-- same workspace is always a mistake, and catching it here beats catching it in
-- the UI.
create unique index brands_workspace_name_unique_idx
  on public.brands (workspace_id, lower(btrim(name)));

create trigger brands_set_updated_at
  before update on public.brands
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Brand fonts
-- ---------------------------------------------------------------------------

create type public.font_source as enum ('google', 'upload');

create table public.brand_fonts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  family text not null check (char_length(btrim(family)) between 1 and 120),
  weight int not null default 400 check (weight between 100 and 900),
  style text not null default 'normal' check (style in ('normal', 'italic')),

  -- Path inside the brand-assets bucket: {workspace_id}/{brand_id}/fonts/...
  storage_path text not null,
  source public.font_source not null,

  created_at timestamptz not null default now(),

  -- The export pipeline builds one @font-face per row. Duplicates would emit
  -- competing declarations for the same family/weight/style.
  unique (brand_id, family, weight, style)
);

comment on table public.brand_fonts is
  'One row per stored .woff2. Google-picked and hand-uploaded fonts are stored identically so export embedding treats them the same.';

create index brand_fonts_workspace_id_idx on public.brand_fonts (workspace_id);
create index brand_fonts_brand_id_idx on public.brand_fonts (brand_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.brands enable row level security;
alter table public.brand_fonts enable row level security;

create policy "members read brands"
  on public.brands for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create brands"
  on public.brands for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members update brands"
  on public.brands for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members delete brands"
  on public.brands for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members read brand fonts"
  on public.brand_fonts for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create brand fonts"
  on public.brand_fonts for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members update brand fonts"
  on public.brand_fonts for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members delete brand fonts"
  on public.brand_fonts for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Storage: brand-assets
-- ---------------------------------------------------------------------------
--
-- Public read is deliberate. The browser must fetch brand fonts and logos
-- during template rendering AND during html-to-image rasterization; forcing
-- signed URLs onto that path would add a round trip and an expiry failure mode
-- to the export pipeline, which is the one place this product cannot afford
-- flakiness. Writes stay locked to workspace members.

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

-- Path convention: {workspace_id}/{brand_id}/...
-- foldername(name)[1] is the workspace segment. Compared as text against the
-- membership set rather than cast to uuid, so a malformed path fails the policy
-- instead of raising an invalid-input error.
create policy "workspace members upload brand assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and exists (
      select 1
      from public.current_workspace_ids() as w(id)
      where w.id::text = (storage.foldername(name))[1]
    )
  );

create policy "workspace members update brand assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and exists (
      select 1
      from public.current_workspace_ids() as w(id)
      where w.id::text = (storage.foldername(name))[1]
    )
  );

create policy "workspace members delete brand assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and exists (
      select 1
      from public.current_workspace_ids() as w(id)
      where w.id::text = (storage.foldername(name))[1]
    )
  );
