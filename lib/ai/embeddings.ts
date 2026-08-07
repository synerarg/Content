import "server-only";

import { CodedError } from "@/lib/errors";

/*
  Embeddings, for telling "we already said this" from "we already used these
  words".

  Gemini rather than a dedicated embedding provider, for one reason: the project
  already has a Gemini key with credit. Adding OpenAI or Cohere would mean a new
  credential, a new billing relationship and a new thing to rotate, for a feature
  whose output is a warning label.

  Everything here is measured rather than assumed — see scripts/probe-embeddings.ts
  for the run the threshold comes from, and lib/ai/similarity.ts for what the
  numbers turned out to be.
*/

export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * 768, not the model's native 3072.
 *
 * Four times less to store and to index, and pgvector's HNSW is happier for it.
 * The model is trained with Matryoshka representation learning, so a truncated
 * prefix is a valid embedding rather than a lossy crop — but it comes back
 * UNNORMALISED at reduced dimensions, which is why `normalise` below is not
 * optional decoration.
 */
export const EMBEDDING_DIMENSIONS = 768;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}`;

/**
 * How many texts go in one request.
 *
 * The API takes a batch; this keeps each one small enough that a single failure
 * costs little and a slow response does not sit near the route's ceiling.
 */
const BATCH_SIZE = 50;

/** Captions run long; the model truncates, and paying to embed a novel is silly. */
const MAX_CHARS = 4000;

type EmbedResponse = {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string; status?: string };
};

/**
 * Scale a vector to unit length.
 *
 * Cosine distance does not require it — pgvector's `<=>` normalises internally —
 * but storing unnormalised vectors means the numbers in the column disagree with
 * the numbers any future inner-product query would produce, and that kind of
 * quiet inconsistency is exactly what makes a similarity threshold stop meaning
 * what it meant when it was calibrated. Measured: at 768 dimensions the raw
 * vectors come back with a norm around 0.59.
 */
function normalise(values: number[]): number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const length = Math.sqrt(sum);
  if (!Number.isFinite(length) || length === 0) return values;
  return values.map((value) => value / length);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Embed a list of texts, in order.
 *
 * Returns one vector per input, at the same index. An empty or whitespace-only
 * input yields `null` in its slot rather than a meaningless vector — a blank
 * caption is not similar to anything, and giving it a vector would make it
 * similar to every other blank one.
 */
export async function embedTexts(
  texts: string[],
): Promise<Array<number[] | null>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CodedError(
      "config",
      "Falta GEMINI_API_KEY. Se necesita para indexar el contenido.",
    );
  }

  const results: Array<number[] | null> = new Array(texts.length).fill(null);

  // Blank inputs never reach the API, and the mapping back to the original
  // positions is kept explicitly rather than by filtering and hoping the
  // lengths line up.
  const pending = texts
    .map((text, index) => ({ index, text: text.trim().slice(0, MAX_CHARS) }))
    .filter((entry) => entry.text.length > 0);

  for (const group of chunk(pending, BATCH_SIZE)) {
    const response = await fetch(`${ENDPOINT}:batchEmbedContents`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: group.map((entry) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: entry.text }] },
          // The task type is not cosmetic: it tells the model to place texts so
          // that CLOSENESS MEANS "says the same thing". The default asks for a
          // general-purpose embedding, which is a different geometry.
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
    });

    const raw = await response.text();

    if (!response.ok) {
      let message = `Error al indexar (HTTP ${response.status})`;
      try {
        message = (JSON.parse(raw) as EmbedResponse).error?.message ?? message;
      } catch {
        // Keep the status-based message.
      }

      // Same split as the image provider: a depleted account and a per-minute
      // limit both answer 429 and need opposite responses, and Google's
      // credit message also contains the word "quota" — so billing is tested
      // first, on purpose.
      if (/prepayment credits|credits are depleted|billing/i.test(raw)) {
        throw new CodedError("billing", message);
      }
      if (response.status === 429) {
        throw new CodedError("rate_limit", message);
      }
      throw new CodedError("provider", message);
    }

    let payload: EmbedResponse;
    try {
      payload = JSON.parse(raw) as EmbedResponse;
    } catch {
      throw new CodedError("provider", "El indexador devolvió una respuesta ilegible.");
    }

    const embeddings = payload.embeddings ?? [];
    if (embeddings.length !== group.length) {
      throw new CodedError(
        "provider",
        `Se pidieron ${group.length} vectores y volvieron ${embeddings.length}.`,
      );
    }

    for (const [offset, entry] of group.entries()) {
      const values = embeddings[offset]?.values;
      if (Array.isArray(values) && values.length === EMBEDDING_DIMENSIONS) {
        results[entry.index] = normalise(values);
      }
    }
  }

  return results;
}

/** What pgvector's input function parses, and what find_similar_content expects. */
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}
