/*
  Where "this is a repeat" begins.

  The number is MEASURED, and re-measurable: `npm run probe:embeddings` scores a
  set of labelled Spanish caption pairs and asserts that this threshold sits
  between the ones that are repeats and the ones that merely share a topic. Run
  it again if the embedding model or its dimensionality changes; the bands move.

  Why it is not a round number chosen by feel: cosine similarity between
  UNRELATED Spanish marketing copy is already high — two sentences with nothing
  in common, spreadsheets against olive oil, measured 0.73. "0.8 sounds like a
  lot" would have shipped a warning that fires on everything.

  Deliberately free of `server-only`: the route decides with it, and the panel
  explains it.
*/

/*
  MEASURED, 2026-08-07, gemini-embedding-001 at 768 dims:

    duplicado        0.8234 … 0.8682
    mismo tema       0.7296 … 0.8129
    no relacionado   0.7106 … 0.7787

  0.82 is the only value that separates all three, and it separates the first
  two by 0.0105. That margin is the most important thing on this page.

  IT IS A HINT, NOT A VERDICT. A tenth of a point of cosine distance is not
  enough to be confident about any single pair, so nothing blocks on this and
  the wording on screen says "se parece a", never "es un duplicado". What it is
  genuinely good at is the case it was built for: the same argument written
  three different ways, which scored 0.82-0.87 while a different argument about
  the same topic stayed at 0.73-0.81.
*/

/** At or above this, two captions are probably making the same argument. */
export const DUPLICATE_THRESHOLD = 0.82;

/**
 * A softer band, for showing a piece its nearest neighbour without crying wolf.
 *
 * 0.80, not lower: unrelated copy reached 0.7787 in the same run, so anything
 * under 0.78 would surface pairs with nothing to do with each other. Nothing
 * blocks on this either — it is what "lo más parecido que ya escribimos" means
 * on screen when there is no likely repeat to report.
 */
export const RELATED_THRESHOLD = 0.8;

/** How many neighbours are worth naming for one piece before it becomes noise. */
export const MAX_MATCHES_PER_POST = 3;

/** 0.8712 -> "87%". Nobody reads four decimals of cosine distance. */
export function formatSimilarity(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}
