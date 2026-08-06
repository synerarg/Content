import type { FormatKey } from "@/templates/types";

/**
 * Image prompt composition.
 *
 * Versioned like the text prompt, and recorded on every `generations` row so a
 * change in output can be traced to the wording that caused it.
 */
export const IMAGE_PROMPT_VERSION = "2026-08-05.1";

export type ArtDirection = {
  photographic_style: string;
  lighting: string;
  palette_notes: string;
  avoid: string[];
};

/*
  THE NO-TEXT RULE

  This is the architectural constraint of the whole product: the image model
  produces backgrounds, and typography is rendered by code. An image with baked-in
  letterforms defeats that entirely — it cannot be edited, translated, or laid
  out, and it is exactly the "AI made this and the typography is bad" failure the
  system exists to avoid.

  FLUX.2 exposes NO negative_prompt parameter (its input schema is prompt,
  image_size, num_images, seed, output_format, guidance_scale,
  num_inference_steps, enable_safety_checker). So the exclusions cannot be
  passed as a separate negative field the way they could with Stable Diffusion —
  they have to be stated in the positive prompt.

  This block is appended by the engine, never by a caller, so it cannot be
  forgotten or overridden from the UI.
*/
const NO_TEXT_DIRECTIVE = [
  "The image contains absolutely no text of any kind.",
  "No letters, no words, no numbers, no typography, no captions, no subtitles.",
  "No watermarks, no logos, no brand marks, no signage, no billboards, no posters.",
  "No screens, phones or monitors displaying readable text or interface elements.",
  "Clean photographic background only.",
].join(" ");

/** Where the template will place type, so the image leaves room for it. */
const COMPOSITION_BY_TEMPLATE: Record<string, string> = {
  "bold-headline":
    "Composition: the subject sits in the upper two thirds. The lower third is visually calm and uncluttered — soft gradient, shadow or shallow depth of field — so overlaid type stays readable. Leave clear negative space at the bottom.",
  "quote-card":
    "Composition: atmospheric and low-contrast overall, with no busy detail in the centre. The image reads as texture behind type rather than as the subject itself.",
};

const FORMAT_HINT: Record<FormatKey, string> = {
  feed: "Vertical 4:5 framing.",
  story: "Tall vertical 9:16 framing, with the subject centred in the upper half.",
};

export function composeImagePrompt({
  brief,
  artDirection,
  format,
  templateSlug,
}: {
  brief: string;
  artDirection: ArtDirection;
  format: FormatKey;
  templateSlug: string;
}): string {
  const parts: string[] = [];

  // 1. Subject.
  parts.push(brief.trim());

  // 2. Brand art direction.
  if (artDirection.photographic_style.trim()) {
    parts.push(artDirection.photographic_style.trim());
  }
  if (artDirection.lighting.trim()) {
    parts.push(`Lighting: ${artDirection.lighting.trim()}.`);
  }
  if (artDirection.palette_notes.trim()) {
    parts.push(`Colour: ${artDirection.palette_notes.trim()}.`);
  }

  // 3. Composition, so the type has somewhere to live.
  parts.push(FORMAT_HINT[format]);
  const composition = COMPOSITION_BY_TEMPLATE[templateSlug];
  if (composition) parts.push(composition);

  // 4. Brand-specific exclusions, then the non-negotiable ones.
  const avoid = artDirection.avoid.map((item) => item.trim()).filter(Boolean);
  if (avoid.length > 0) {
    parts.push(`Avoid: ${avoid.join(", ")}.`);
  }
  parts.push(NO_TEXT_DIRECTIVE);

  return parts.join(" ");
}
