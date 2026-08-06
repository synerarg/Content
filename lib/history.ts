/**
 * Split a pasted block of published captions into individual posts.
 *
 * Lives here, not in the actions file, because BOTH sides need it: the server
 * action to decide what to insert, and the paste box to show a live count
 * before you commit. A `"use server"` module may only export async functions,
 * so a shared synchronous helper cannot live there.
 *
 * Blank lines are the separator because that is how captions arrive when
 * copied one after another — a single newline is part of a caption's own
 * formatting and must not split it.
 */
export function splitPastedCaptions(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.replace(/[ \t]+\n/g, "\n").trim())
    .filter((block) => block.length > 0);
}
