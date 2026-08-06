-- 20260805000900_generation_usage_view  (migration 0009)
--
-- Pre-aggregated view behind the cost panel in /configuracion.
--
-- Why a view and not a client-side rollup: `generations` grows by one row per
-- AI call forever, and the panel wants all-time totals. Pulling every row into
-- a Server Component to sum it in JS is fine at 50 rows and absurd at 50,000.
-- Grouping to (brand, kind, day) collapses that to a handful of rows per brand
-- per day while still supporting every rollup the panel shows — totals, last-30-
-- days, per-brand, per-kind — from a single query.
--
-- ===========================================================================
-- SECURITY: `security_invoker = on` is the load-bearing line in this file.
-- ===========================================================================
-- A Postgres view executes as its OWNER by default. This view is owned by
-- postgres, which bypasses RLS — so without `security_invoker`, ANY
-- authenticated caller selecting from it would read the generation costs of
-- EVERY workspace, straight through the policies on the underlying table.
-- With it on, the view runs as the caller and `generations`' own RLS applies
-- exactly as it does to a direct select. Requires Postgres 15+.
--
-- scripts/verify-rls.mjs asserts this from the outside: the view is in its
-- table list, so an anonymous read of it must come back as an empty array.

create view public.generation_usage_daily
with (security_invoker = on) as
select
  g.workspace_id,
  g.brand_id,
  g.kind,

  -- Bucketed in Buenos Aires time, not UTC. The agency reads this to answer
  -- "what did we spend today", and UTC would move a 9pm generation into
  -- tomorrow. The app is Rioplatense end to end; this is consistent with that.
  (g.created_at at time zone 'America/Argentina/Buenos_Aires')::date as day,

  count(*)::int as calls,
  count(*) filter (where g.ok)::int as ok_calls,
  count(*) filter (where not g.ok)::int as failed_calls,

  coalesce(sum(g.input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(g.output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(g.cache_read_tokens), 0)::bigint as cache_read_tokens,
  coalesce(sum(g.cache_write_tokens), 0)::bigint as cache_write_tokens,

  -- Rows whose model has no known rate carry a NULL cost. sum() skips them, so
  -- this is "cost of what we can price", never a zero standing in for unknown.
  -- `priced_calls` is what lets the UI say so honestly instead of implying the
  -- total is complete.
  coalesce(sum(g.cost_estimate_usd), 0)::numeric(14, 6) as cost_usd,
  count(*) filter (where g.cost_estimate_usd is not null)::int as priced_calls,

  coalesce(avg(g.duration_ms), 0)::int as avg_duration_ms,
  max(g.created_at) as last_call_at
from public.generations as g
group by g.workspace_id, g.brand_id, g.kind,
         (g.created_at at time zone 'America/Argentina/Buenos_Aires')::date;

comment on view public.generation_usage_daily is
  'Per-brand, per-kind, per-day rollup of the generations log. security_invoker: RLS on generations applies to the caller.';

-- anon is granted alongside authenticated deliberately, matching how every
-- other table in this schema is exposed: the grant is not the protection, RLS
-- is. Keeping anon able to REACH the view is what lets verify-rls.mjs prove the
-- rows are denied rather than merely unreachable — a revoked grant would hide a
-- broken policy behind a 401.
grant select on public.generation_usage_daily to anon, authenticated;
