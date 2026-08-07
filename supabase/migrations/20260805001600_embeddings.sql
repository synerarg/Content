-- 20260805001600_embeddings  (migration 0016)
--
-- Semantic near-duplicate detection.
--
-- ---------------------------------------------------------------------------
-- Why this exists, and why keywords were not enough
-- ---------------------------------------------------------------------------
--
-- HANDOFF §10 records a measurement, not a suspicion: the automated
-- keyword-collision metric built during the published-history work reported 0/7
-- for BOTH the good run and the bad one and was useless, because it required
-- literal matches of long phrases that never reappear verbatim. The note ends
-- "a real check needs semantic similarity, not keywords". This is that check.
--
-- The generator repeats itself in a way keywords cannot see. Three consecutive
-- batches produced a story titled "Tu competencia ya tiene web"; another wrote
-- "Un catálogo de fotos no cobra" against a published caption reading "no es un
-- catálogo de fotos". Nothing lexical connects the second pair. An embedding
-- does.
--
-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
--
-- 768 dimensions, from Gemini's `gemini-embedding-001` with
-- `outputDimensionality: 768`. Verified live before this migration was written —
-- and worth recording, because `text-embedding-004`, which the docs still
-- reference, answers 404 on this API version. The model is chosen because the
-- project ALREADY has a Gemini key with credit; adding an embedding provider
-- would mean a new credential for a feature that is a warning label.
--
-- Both tables get a column because both sides matter: what the brand has
-- PUBLISHED, and what this app has already GENERATED for it. A batch that
-- repeats last month's batch is the same failure as one that repeats the
-- client's own feed.

create extension if not exists vector;

-- `if not exists` on every statement in this migration: the first attempt
-- failed on the function at the bottom, and a migration that cannot be re-run
-- after a partial apply is one you have to repair by hand against production.
alter table public.brand_published_posts
  add column if not exists embedding vector(768);

alter table public.posts
  add column if not exists embedding vector(768);

comment on column public.brand_published_posts.embedding is
  'gemini-embedding-001 at 768 dims, task SEMANTIC_SIMILARITY. Null until indexed.';

comment on column public.posts.embedding is
  'gemini-embedding-001 at 768 dims. Written when the batch is generated; null for older rows until backfilled.';

/*
  HNSW rather than IVFFlat.

  IVFFlat has to be built against existing data to pick its lists, so it is the
  wrong choice for a table that starts empty and grows — it would need
  rebuilding to stay accurate. HNSW needs no training and its recall does not
  decay as rows arrive. On an archive of a few thousand captions neither is
  strictly necessary; the point is that the one that is here does not silently
  get worse.

  Cosine distance, matching the metric the embeddings are normalised for.
*/
create index if not exists brand_published_posts_embedding_idx
  on public.brand_published_posts
  using hnsw (embedding vector_cosine_ops);

create index if not exists posts_embedding_idx
  on public.posts
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- The lookup
-- ---------------------------------------------------------------------------
--
-- `query_embedding` arrives as TEXT and is cast here, deliberately. PostgREST
-- serialises a JSON array of numbers, and whether that coerces cleanly into a
-- `vector` parameter depends on cast rules that are not worth betting a feature
-- on. `JSON.stringify(embedding)` produces exactly the `[0.1,0.2,…]` literal
-- pgvector's input function parses, and the cast is then explicit and visible.
--
-- SECURITY INVOKER: RLS on posts, content_batches, brands and
-- brand_published_posts all apply inside, so this can only ever search the
-- caller's own workspace.

create or replace function public.find_similar_content(
  brand uuid,
  query_embedding text,
  match_threshold double precision default 0.82,
  max_results int default 5,
  exclude_post uuid default null
)
returns table (
  source text,
  ref_id uuid,
  batch_id uuid,
  label text,
  excerpt text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select query_embedding::public.vector(768) as v)
  (
    select
      'publicado'::text,
      h.id,
      null::uuid,
      -- ::text because `source` is the published_post_source ENUM, and an enum
      -- cannot be UNIONed with the text column it lines up against below.
      coalesce(h.source::text, 'manual'),
      h.caption,
      -- pgvector's <=> is cosine DISTANCE; similarity is its complement.
      1 - (h.embedding operator(public.<=>) q.v)
    from public.brand_published_posts h, q
    where h.brand_id = brand
      and h.embedding is not null
      and 1 - (h.embedding operator(public.<=>) q.v) >= match_threshold
  )
  union all
  (
    select
      'generado'::text,
      p.id,
      b.id,
      b.title,
      p.caption,
      1 - (p.embedding operator(public.<=>) q.v)
    from public.posts p
      join public.content_batches b
        on b.id = p.batch_id
        -- A soft-deleted batch is invisible everywhere else; warning about a
        -- piece nobody can open would be worse than not warning at all.
        and b.deleted_at is null
        and b.brand_id = brand
      , q
    where p.embedding is not null
      and (exclude_post is null or p.id <> exclude_post)
      and 1 - (p.embedding operator(public.<=>) q.v) >= match_threshold
  )
  order by 6 desc
  limit greatest(1, least(coalesce(max_results, 5), 20))
$$;

comment on function public.find_similar_content(uuid, text, double precision, int, uuid) is
  'Nearest published or already-generated captions for a brand, by cosine similarity. Runs as the caller, so RLS applies.';
