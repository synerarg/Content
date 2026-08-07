import type { AnyTemplateDefinition } from "@/templates/registry";

/*
  Character limits, read off the template's own zod schema.

  This lived in three places — generate-post, generate-batch and the batch
  prompt — and variants would have made four. That matters more than ordinary
  duplication would, because of WHAT is duplicated: it reaches into zod v4's
  internal `_zod.def.checks` structure, which is not public API. Verified against
  zod 4.4.3; a zod upgrade can break it, and the whole point of one copy is that
  there is now one place to re-check rather than four to find.

  Why the limits are not simply enforced by the schema handed to the model:
  structured outputs does not support string minLength/maxLength. The SDK strips
  those constraints before sending and then validates them client-side, so
  leaving `.max()` in the AI-facing schema means the model never sees the limit
  while the parse still fails over it — killing an otherwise good generation
  because a headline came back three characters long. So the AI-facing schema is
  lenient, the limits are stated in the prompt where the model can act on them,
  and overflow is trimmed here with a warning.

  Deliberately free of `server-only`: prompts/ and lib/ai/ both need it.
*/

/** A slot's declared maximum length, or null if it has none. */
export function maxLengthOf(
  template: AnyTemplateDefinition,
  key: string,
): number | null {
  const field = template.slots.shape[key];
  const checks =
    (field as unknown as {
      _zod?: {
        def?: {
          checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }>;
        };
      };
    })?._zod?.def?.checks ?? [];

  for (const check of checks) {
    const def = check?._zod?.def;
    if (def?.check === "max_length" && typeof def.maximum === "number") {
      return def.maximum;
    }
  }
  return null;
}

/**
 * Trim overflowing slot values at a word boundary, reporting what was cut.
 *
 * Cutting mid-word produces "Tu competencia ya tiene we", which reads as a bug
 * rather than as an edit — so the cut moves back to the last space, unless that
 * would discard more than 40% of the allowance, in which case a hard cut is the
 * lesser evil.
 */
export function trimToLimits(
  template: AnyTemplateDefinition,
  slots: Record<string, string>,
): { slots: Record<string, string>; warnings: string[] } {
  const result: Record<string, string> = {};
  const warnings: string[] = [];

  for (const [key, raw] of Object.entries(slots)) {
    const value = (raw ?? "").trim();
    const limit = maxLengthOf(template, key);

    if (limit !== null && value.length > limit) {
      const cut = value.slice(0, limit);
      const lastSpace = cut.lastIndexOf(" ");
      result[key] = (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
      warnings.push(
        `"${key}" volvió con ${value.length} caracteres (máximo ${limit}) y se recortó.`,
      );
    } else {
      result[key] = value;
    }
  }

  return { slots: result, warnings };
}
