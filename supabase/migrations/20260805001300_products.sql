-- 20260805001300_products  (migration 0013)
--
-- Client products: the real thing that appears in the piece.
--
-- The architectural rule this follows is the same one that governs typography:
-- the image model never draws the product. It draws the SCENE — a surface, a
-- light, an empty area — and the template composites the client's actual pixels
-- on top. A model asked to reproduce a bottle from a reference redraws it:
-- invented letterforms on the label, the silhouette slightly wrong, the logo
-- garbled. That is acceptable for a mood board and unacceptable for the client's
-- own product. So a product is a brand asset, like the logo, and it is
-- composited rather than generated.
--
-- Lives in `brand-assets` (public bucket) rather than `generated`, for the same
-- reason the logo does: the export path fetches it during rasterization and
-- signed URLs would add an expiry failure mode to the one place this product
-- cannot afford flakiness.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create table public.brand_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  name text not null check (char_length(btrim(name)) between 1 and 120),

  -- What it IS, in words. Read by the copy generator, so a piece about the
  -- product can say something true about it instead of describing a photograph.
  description text not null default '' check (char_length(description) <= 2000),

  -- Path inside brand-assets: {workspace_id}/{brand_id}/products/{uuid}.{ext}
  image_path text not null,

  /*
    Whether the stored image has a real alpha channel.

    Load-bearing, not informational: a template that lays the product over a
    generated scene needs a cut-out. Compositing a photo that still carries its
    white studio backdrop pastes a white rectangle over the scene, which reads
    as a bug. The product picker uses this to say which templates a given photo
    can actually be used with, so the failure is prevented rather than shipped.

    Measured in the browser at upload time by sampling the alpha channel — never
    inferred from the file extension, since a PNG is opaque far more often than
    not.
  */
  has_transparency boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brand_products is
  'A client product with a real photograph. Composited into the piece by code; never drawn by the image model.';

create index brand_products_workspace_id_idx on public.brand_products (workspace_id);
create index brand_products_brand_id_idx on public.brand_products (brand_id);

-- Same reasoning as brands: two products called "Botella 500ml" under one brand
-- is a double-submit or a mistake, and catching it here beats catching it in
-- the UI.
create unique index brand_products_brand_name_unique_idx
  on public.brand_products (brand_id, lower(btrim(name)));

create trigger brand_products_set_updated_at
  before update on public.brand_products
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Slides carry the product they composite
-- ---------------------------------------------------------------------------
--
-- `on delete set null`, not cascade: deleting a product must not delete the
-- pieces that used it. The slide keeps its copy and its background and simply
-- stops showing a product, which is recoverable by hand; the alternative
-- silently destroys an afternoon of work.
--
-- Note what is NOT enforced here: that the product belongs to the same brand as
-- the slide's batch. Slides do not carry brand_id — they reach it through
-- posts -> content_batches — so this would need a trigger, and the only writer
-- is a picker that already lists one brand's products. Documented rather than
-- enforced, deliberately.

alter table public.slides
  add column product_id uuid references public.brand_products (id) on delete set null;

comment on column public.slides.product_id is
  'Product composited onto this slide, if any. Not FK-constrained to the slide''s brand: see migration 0013.';

create index slides_product_id_idx on public.slides (product_id)
  where product_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.brand_products enable row level security;

create policy "members read brand products"
  on public.brand_products for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create brand products"
  on public.brand_products for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members update brand products"
  on public.brand_products for update to authenticated
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));

create policy "members delete brand products"
  on public.brand_products for delete to authenticated
  using (workspace_id in (select public.current_workspace_ids()));
