-- 20260805000400_generations  (migration 0004)
--
-- Every AI call gets a row here, starting with the first one.
--
-- Cost visibility was a day-one requirement, not a Phase 6 nice-to-have: an
-- agency running batches across several client brands needs to know what a post
-- costs before the invoice arrives, and retrofitting usage logging after the
-- fact means the early data is simply gone.

create type public.generation_kind as enum ('text', 'image');

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,

  kind public.generation_kind not null,
  provider text not null,
  model text not null,

  -- What went in and what came back. Kept as jsonb rather than as columns
  -- because the shape differs per provider and per call type, and this is a log
  -- we read whole, never query into.
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,

  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,

  -- Numeric, not float: money. 6 decimal places covers per-call costs down to
  -- a millionth of a dollar, which matters when a single caption is ~$0.002.
  cost_estimate_usd numeric(12, 6),

  duration_ms int,
  ok boolean not null default true,
  error text,

  created_at timestamptz not null default now()
);

comment on table public.generations is
  'Append-only log of every AI call: what was asked, what came back, and what it cost.';

create index generations_workspace_id_idx on public.generations (workspace_id);
create index generations_brand_id_idx on public.generations (brand_id);
create index generations_created_at_idx on public.generations (created_at desc);

alter table public.generations enable row level security;

create policy "members read generations"
  on public.generations for select to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

create policy "members create generations"
  on public.generations for insert to authenticated
  with check (workspace_id in (select public.current_workspace_ids()));

-- Deliberately no UPDATE or DELETE policy. This is an audit log: rows are
-- written once and never edited. Anything that needs correcting gets a new row.
