-- 20260805001500_search  (migration 0015)
--
-- Searching everything the agency has ever written.
--
-- The archive is the point. A piece written four months ago for one client is
-- the answer to "¿qué dijimos de precios?" and today it can only be found by
-- opening batches one at a time until it turns up.
--
-- ---------------------------------------------------------------------------
-- Why this is a function and not a query in the app
-- ---------------------------------------------------------------------------
--
-- A post's searchable text is spread across three tables: its own caption and
-- hashtags, the on-image copy in its slides' jsonb, and the title and brief of
-- the batch it belongs to. Assembling that in PostgREST means three round trips
-- and a merge in JavaScript that would rank nothing. One function keeps the
-- ranking, the Spanish stemming and the soft-delete filter in a single place.
--
-- SECURITY INVOKER (the default, stated for the reader): the function runs as
-- the caller, so every RLS policy on posts, slides, batches and brands applies
-- inside it exactly as it would outside. There is no privilege here to leak.
--
-- ---------------------------------------------------------------------------
-- Performance, honestly
-- ---------------------------------------------------------------------------
--
-- This computes a tsvector per candidate row on every search: a sequential scan
-- with no index behind it. That is a deliberate v1 for an archive measured in
-- thousands of rows, where it costs single-digit milliseconds.
--
-- When it stops being fast the fix is known and mechanical: add a stored
-- generated tsvector column to `posts` and `slides`, index it GIN, and change
-- the WHERE below to hit those columns. Doing it now would mean maintaining a
-- denormalised search document before there is a single query slow enough to
-- notice.

-- ---------------------------------------------------------------------------
-- Slot text out of jsonb
-- ---------------------------------------------------------------------------
--
-- A slide's copy lives in `slots`, whose KEYS differ per template. Naming them
-- here would tie this migration to the template registry and go stale the first
-- time a template adds a field, so every value is taken and the keys are
-- ignored.
--
-- IMMUTABLE is truthful: jsonb stores its keys in a deterministic order, so the
-- aggregate below returns the same string for the same input every time.

create or replace function public.jsonb_values_text(doc jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(value, ' '), '')
  from jsonb_each_text(coalesce(doc, '{}'::jsonb))
$$;

comment on function public.jsonb_values_text(jsonb) is
  'Concatenates every value in a flat jsonb object, ignoring keys. Used to make slide slots searchable without hardcoding template slot names.';

-- ---------------------------------------------------------------------------
-- The search
-- ---------------------------------------------------------------------------
--
-- `websearch_to_tsquery` rather than `plainto_tsquery`: it understands quoted
-- phrases and `-exclusion`, which is what someone typing into a search box
-- expects, and it never raises on malformed input — it just returns fewer
-- results. That last property is what makes it safe to hand raw user text.
--
-- The 'spanish' configuration stems and drops stopwords in Spanish, so
-- "planillas" finds "planilla" and "de"/"la" do not dominate the ranking.

create or replace function public.search_content(
  query text,
  brand_filter uuid default null,
  max_results int default 60
)
returns table (
  post_id uuid,
  batch_id uuid,
  batch_title text,
  brand_id uuid,
  brand_name text,
  post_type public.post_type,
  caption text,
  slide_text text,
  scheduled_on date,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with parsed as (
    select websearch_to_tsquery('spanish', coalesce(query, '')) as tsq
  )
  select
    p.id,
    b.id,
    b.title,
    br.id,
    br.name,
    p.type,
    p.caption,
    coalesce(s.txt, ''),
    p.scheduled_on,
    p.created_at,
    ts_rank(doc.v, parsed.tsq)
  from public.posts p
    join public.content_batches b
      on b.id = p.batch_id
      -- Soft-deleted batches are invisible everywhere else; a search that
      -- surfaced them would be the one screen where deleting appears not to work.
      and b.deleted_at is null
    join public.brands br on br.id = b.brand_id
    cross join parsed
    left join lateral (
      select string_agg(public.jsonb_values_text(sl.slots), ' ') as txt
      from public.slides sl
      where sl.post_id = p.id
    ) s on true
    cross join lateral (
      select to_tsvector(
        'spanish',
        concat_ws(' ',
          p.caption,
          p.cta,
          array_to_string(p.hashtags, ' '),
          s.txt,
          b.title,
          b.brief
        )
      ) as v
    ) doc
  where parsed.tsq is not null
    and doc.v @@ parsed.tsq
    and (brand_filter is null or br.id = brand_filter)
  order by ts_rank(doc.v, parsed.tsq) desc, p.created_at desc
  limit greatest(1, least(coalesce(max_results, 60), 200))
$$;

comment on function public.search_content(text, uuid, int) is
  'Full-text search over every piece: caption, CTA, hashtags, on-image slot copy, and the batch title and brief. Runs as the caller, so RLS applies.';
