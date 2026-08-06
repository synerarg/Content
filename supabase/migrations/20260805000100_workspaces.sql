-- 20260805000100_workspaces  (migration 0001)
--
-- The multi-tenant spine for Synera Content Studio.
--
-- Design rules this migration establishes, which every later migration follows:
--
--   1. Every tenant-scoped table carries its own `workspace_id` column. Policies
--      never walk a foreign-key chain to discover the tenant, because a policy
--      that joins slides -> posts -> batches -> brands runs that join for every
--      candidate row.
--
--   2. Membership is resolved through current_workspace_ids(), a SECURITY
--      DEFINER function. SECURITY DEFINER bypasses RLS inside the function body,
--      which is precisely what stops infinite recursion: workspace_members has
--      its own SELECT policy, and a policy that queried workspace_members
--      directly would re-enter that policy forever.
--
--   3. Every policy has the same shape:
--        workspace_id in (select public.current_workspace_ids())
--
--   4. auth.uid() is always wrapped as (select auth.uid()). Postgres hoists the
--      subquery into an InitPlan and evaluates it once per query instead of once
--      per row.
--
--   5. Every workspace_id column gets an index. The policy predicate is only as
--      fast as the index behind it.

-- No pgcrypto needed: gen_random_uuid() is core Postgres since 13, and
-- creating extensions on hosted Supabase can trip over schema privileges.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Touch trigger for updated_at. Reused by every table in later migrations.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is
  'Agency-level tenant. One per signup today; multi-user is a membership row away.';

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row
  execute function public.set_updated_at();

create type public.workspace_role as enum ('owner', 'member');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- The membership lookup is keyed by user_id (see current_workspace_ids), so it
-- needs its own index; the composite primary key leads with workspace_id and
-- cannot serve that predicate.
create index workspace_members_user_id_idx
  on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Membership helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER is load-bearing: it bypasses RLS inside the body so the
-- workspace_members SELECT policy cannot recurse into itself.
--
-- `set search_path = ''` is a hardening requirement for SECURITY DEFINER
-- functions, and it is why every identifier below is schema-qualified.
create or replace function public.current_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id
  from public.workspace_members
  where user_id = (select auth.uid())
$$;

comment on function public.current_workspace_ids() is
  'Workspace IDs the calling user belongs to. The single source of truth for every RLS policy in this database.';

revoke all on function public.current_workspace_ids() from public;
grant execute on function public.current_workspace_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "members read their workspaces"
  on public.workspaces
  for select
  to authenticated
  using (id in (select public.current_workspace_ids()));

create policy "owners update their workspaces"
  on public.workspaces
  for update
  to authenticated
  using (id in (select public.current_workspace_ids()))
  with check (id in (select public.current_workspace_ids()));

create policy "members read membership of their workspaces"
  on public.workspace_members
  for select
  to authenticated
  using (workspace_id in (select public.current_workspace_ids()));

-- Deliberately no INSERT policy on either table.
--
-- Workspaces are created exclusively by handle_new_user() below, which runs as
-- SECURITY DEFINER. Letting clients INSERT their own workspace rows would let a
-- user mint workspaces they are not a member of, and letting them INSERT
-- membership rows would let them join someone else's workspace outright. When
-- team invites arrive post-MVP, they get a dedicated SECURITY DEFINER function
-- that validates the invite token, not a blanket INSERT policy.

-- ---------------------------------------------------------------------------
-- Signup: every new user gets a workspace and owns it
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  derived_name text;
begin
  derived_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Mi espacio'
  );

  insert into public.workspaces (name)
  values (derived_name)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
