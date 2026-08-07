import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, toVectorLiteral } from "@/lib/ai/embeddings";
import {
  DUPLICATE_THRESHOLD,
  MAX_MATCHES_PER_POST,
  formatSimilarity,
} from "@/lib/ai/similarity";

/*
  "We already said this."

  Two jobs, kept together because they share the embedding call: writing vectors
  onto rows, and asking what a new caption is closest to.

  Everything here is best-effort by design. A batch that took 50 seconds and cost
  real money must not be lost because the indexer had a bad minute, so every
  entry point returns what it managed and reports what it could not — the
  callers turn that into a warning, never into a failure.
*/

// The generated database types do not describe RPC return rows usefully enough
// to be worth threading through, and this module only ever touches four tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type SimilarMatch = {
  source: string;
  refId: string;
  batchId: string | null;
  label: string;
  excerpt: string;
  similarity: number;
};

type RpcRow = {
  source: string;
  ref_id: string;
  batch_id: string | null;
  label: string | null;
  excerpt: string | null;
  similarity: number;
};

/**
 * Nearest already-known captions for one embedding.
 *
 * `excludePost` keeps a freshly stored post from matching itself, which it
 * would do at similarity 1.0 and drown out everything real.
 */
export async function findSimilar(
  supabase: Client,
  brandId: string,
  embedding: number[],
  options: { threshold?: number; excludePostId?: string | null } = {},
): Promise<SimilarMatch[]> {
  const { data, error } = await supabase.rpc("find_similar_content", {
    brand: brandId,
    query_embedding: toVectorLiteral(embedding),
    match_threshold: options.threshold ?? DUPLICATE_THRESHOLD,
    max_results: MAX_MATCHES_PER_POST,
    exclude_post: options.excludePostId ?? null,
  });

  if (error || !data) return [];

  return (data as RpcRow[]).map((row) => ({
    source: row.source,
    refId: row.ref_id,
    batchId: row.batch_id,
    label: row.label ?? "",
    excerpt: row.excerpt ?? "",
    similarity: row.similarity,
  }));
}

/** One line a person can act on, naming what the piece collides with. */
export function describeMatch(index: number, match: SimilarMatch): string {
  const where =
    match.source === "publicado"
      ? "algo que la marca ya publicó"
      : `el lote "${match.label}"`;

  const excerpt = match.excerpt.replace(/\s+/g, " ").slice(0, 90);

  return `La pieza ${index + 1} se parece un ${formatSimilarity(match.similarity)} a ${where}: "${excerpt}…". Revisá si está diciendo lo mismo.`;
}

export type IndexResult = {
  indexed: number;
  /** Set when the whole attempt failed; the caller reports it as a warning. */
  error: string | null;
};

/**
 * Embed captions and write them onto their posts.
 *
 * Returns the embeddings alongside the count so a caller that also wants to
 * check for duplicates does not pay for a second round of embedding.
 */
export async function indexPosts(
  supabase: Client,
  posts: Array<{ id: string; caption: string }>,
): Promise<IndexResult & { embeddings: Map<string, number[]> }> {
  const embeddings = new Map<string, number[]>();
  if (posts.length === 0) return { indexed: 0, error: null, embeddings };

  try {
    const vectors = await embedTexts(posts.map((post) => post.caption));

    /*
      One update per row rather than an upsert of the set.

      An upsert would need every not-null column of `posts` in the payload —
      the caption included — so it could revert an edit made between the
      generation and this write. Ten updates is not a performance problem;
      silently reverting copy is.
    */
    for (const [index, post] of posts.entries()) {
      const vector = vectors[index];
      if (!vector) continue;

      const { error } = await supabase
        .from("posts")
        .update({ embedding: toVectorLiteral(vector) })
        .eq("id", post.id);

      if (!error) embeddings.set(post.id, vector);
    }

    return { indexed: embeddings.size, error: null, embeddings };
  } catch (cause) {
    return {
      indexed: 0,
      error: cause instanceof Error ? cause.message : "No se pudo indexar.",
      embeddings,
    };
  }
}

/**
 * Index everything for a brand that has no vector yet.
 *
 * Both sides: what the client published and what this app generated. Only rows
 * missing an embedding are touched, so running it twice costs one query and
 * nothing else — which matters, because the obvious way to use it is to press
 * the button again after importing more history.
 */
export async function indexBrand(
  supabase: Client,
  brandId: string,
  limit = 400,
): Promise<{ published: IndexResult; generated: IndexResult }> {
  const published = await indexTable(
    supabase,
    "brand_published_posts",
    { column: "brand_id", value: brandId },
    limit,
  );

  /*
    Posts reach their brand through their batch, which PostgREST cannot filter
    on in an `update`. So the ids are collected first and the rows updated by
    id — two round trips instead of one, and the alternative is a database
    function that exists only to save one.
  */
  const { data: batches } = await supabase
    .from("content_batches")
    .select("id")
    .eq("brand_id", brandId)
    .is("deleted_at", null);

  const batchIds = (batches ?? []).map((batch: { id: string }) => batch.id);
  if (batchIds.length === 0) {
    return { published, generated: { indexed: 0, error: null } };
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, caption")
    .in("batch_id", batchIds)
    .is("embedding", null)
    .limit(limit);

  const rows = (posts ?? []).filter(
    (post: { caption: string | null }) => (post.caption ?? "").trim().length > 0,
  ) as Array<{ id: string; caption: string }>;

  const generated = await indexPosts(supabase, rows);

  return {
    published,
    generated: { indexed: generated.indexed, error: generated.error },
  };
}

async function indexTable(
  supabase: Client,
  table: "brand_published_posts",
  filter: { column: string; value: string },
  limit: number,
): Promise<IndexResult> {
  const { data, error: selectError } = await supabase
    .from(table)
    .select("id, caption")
    .eq(filter.column, filter.value)
    .is("embedding", null)
    .limit(limit);

  if (selectError) return { indexed: 0, error: selectError.message };

  const rows = (data ?? []).filter(
    (row: { caption: string | null }) => (row.caption ?? "").trim().length > 0,
  ) as Array<{ id: string; caption: string }>;

  if (rows.length === 0) return { indexed: 0, error: null };

  try {
    const vectors = await embedTexts(rows.map((row) => row.caption));
    let indexed = 0;

    for (const [index, row] of rows.entries()) {
      const vector = vectors[index];
      if (!vector) continue;

      const { error } = await supabase
        .from(table)
        .update({ embedding: toVectorLiteral(vector) })
        .eq("id", row.id);

      if (!error) indexed++;
    }

    return { indexed, error: null };
  } catch (cause) {
    return {
      indexed: 0,
      error: cause instanceof Error ? cause.message : "No se pudo indexar.",
    };
  }
}
