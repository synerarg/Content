/*
  Showing WHY a result matched.

  A list of captions with no indication of what matched makes the reader
  re-read every one of them, which is most of the work the search was supposed
  to remove. So each result gets a window around its first match with the
  matched words marked.

  Returned as SEGMENTS, never as HTML. Every string here is content the model
  wrote or a user typed, and a helper that returned markup would put it one
  `dangerouslySetInnerHTML` away from being injected. Segments render as React
  nodes and cannot carry markup at all.
*/

export type SnippetSegment = { text: string; match: boolean };

/**
 * Words worth highlighting, pulled out of a raw search box.
 *
 * `websearch_to_tsquery` accepts quoted phrases and `-exclusions`; the quotes
 * are stripped so the words inside still highlight, and exclusions are dropped
 * because marking a word the user asked NOT to see would be nonsense.
 *
 * Very short words are dropped too: highlighting every "de" and "la" in a
 * caption is noise, and the Spanish text search config treats them as
 * stopwords anyway, so they never contributed to the match.
 */
export function searchTerms(query: string): string[] {
  return [...new Set(
    query
      .split(/\s+/)
      .map((term) => term.replace(/["']/g, "").trim())
      .filter((term) => !term.startsWith("-"))
      .filter((term) => term.length >= 3)
      .map((term) => term.toLowerCase()),
  )];
}

/** Lowercase and strip accents, so "presupuesto" finds "Presupuesto". */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * A window of `text` around its first match, split into marked and plain runs.
 *
 * Matching is done on a FOLDED copy while the slices are taken from the
 * original, so accents and capitalisation survive into what is shown. That only
 * works because `normalize("NFD")` followed by dropping combining marks changes
 * the string's length — so the folded copy is built per character and the
 * offsets are kept aligned by folding each character independently.
 */
export function buildSnippet(
  text: string,
  terms: string[],
  radius = 90,
): SnippetSegment[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Fold character by character so index N of the folded string still refers to
  // index N of the original. A whole-string normalize would shift every offset
  // after the first accent.
  const folded = Array.from(clean, (character) => {
    const stripped = fold(character);
    return stripped.length === 1 ? stripped : character.toLowerCase();
  }).join("");

  const hits: Array<{ start: number; end: number }> = [];
  for (const term of terms) {
    const needle = fold(term);
    if (!needle) continue;

    let from = 0;
    for (;;) {
      const index = folded.indexOf(needle, from);
      if (index === -1) break;
      hits.push({ start: index, end: index + needle.length });
      from = index + needle.length;
    }
  }

  if (hits.length === 0) {
    const head = clean.slice(0, radius * 2);
    return [{ text: head.length < clean.length ? `${head}…` : head, match: false }];
  }

  hits.sort((a, b) => a.start - b.start);

  // The window is centred on the FIRST hit rather than on the best one: a
  // reader scanning results wants the beginning of the relevant sentence, and
  // "best" would need a scoring rule nobody asked for.
  const first = hits[0];
  const start = Math.max(0, first.start - radius);
  const end = Math.min(clean.length, first.end + radius);

  const segments: SnippetSegment[] = [];
  let cursor = start;

  for (const hit of hits) {
    if (hit.start < cursor || hit.start >= end) continue;
    if (hit.start > cursor) {
      segments.push({ text: clean.slice(cursor, hit.start), match: false });
    }
    segments.push({ text: clean.slice(hit.start, Math.min(hit.end, end)), match: true });
    cursor = Math.min(hit.end, end);
  }

  if (cursor < end) {
    segments.push({ text: clean.slice(cursor, end), match: false });
  }

  if (start > 0) segments.unshift({ text: "…", match: false });
  if (end < clean.length) segments.push({ text: "…", match: false });

  return segments;
}
