import type { FormatKey } from "@/templates/types";

/**
 * Image prompt composition.
 *
 * Versioned like the text prompt, and recorded on every `generations` row so a
 * change in output can be traced to the wording that caused it.
 */
/*
  2026-08-07.1 — composition guidance for every background template (four had
  none), plus a photographic-craft and anti-cliché block. Untested against the
  provider: the Gemini account ran out of credit before a before/after could be
  run. The comparison is still owed.

  2026-08-07.2 — product scenes. When a piece carries a product, the scene must
  contain an EMPTY staging area and no object standing in it; the client's real
  product is composited into that space afterwards. Also untested live, and it
  is the directive most likely to need a second pass: the failure mode is a
  scene that helpfully includes a bottle of its own.
*/
export const IMAGE_PROMPT_VERSION = "2026-08-07.2";

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

/*
  Where the template will place type, so the image leaves room for it.

  EVERY template that uses a background needs an entry. Four of them had none
  for a long time — list-tips, story-cta and both carousel roles — which meant
  the model composed freely and the type landed wherever it landed, usually over
  the busiest part of the frame. That, more than the model's quality, is what
  made those pieces look thrown together.

  A template that does not use a background (`usesBackground: false`) correctly
  has no entry here and never reaches this code.
*/
const COMPOSITION_BY_TEMPLATE: Record<string, string> = {
  "bold-headline":
    "Composition: the subject sits in the upper two thirds. The lower third is visually calm and uncluttered — soft gradient, shadow or shallow depth of field — so overlaid type stays readable. Leave clear negative space at the bottom.",
  "quote-card":
    "Composition: atmospheric and low-contrast overall, with no busy detail in the centre. The image reads as texture behind type rather than as the subject itself.",
  "list-tips":
    "Composition: the subject is pushed to one side and the opposite two thirds are quiet and even in tone — a wall, a surface, soft falloff — because a stacked list of three points will sit there. No detail crossing the middle of the frame.",
  "story-cta":
    "Composition: the subject occupies the upper half only. The entire lower half is calm and darkening, with nothing the eye needs to read, because both the message and a call to action sit there above the thumb.",
  "carousel-cover":
    "Composition: bold and inviting, the strongest image of the set. Subject in the upper two thirds, the bottom third quiet for a headline and a swipe cue.",
  "carousel-body":
    "Composition: quieter and flatter than a cover — this frame supports a numbered point rather than leading. Even tone across the middle, subject off to one edge, generous empty space.",
  "editorial-split":
    "Composition: this image is CROPPED to a horizontal band, not shown whole. Put the subject dead centre and leave room on all four sides, because the top and bottom will be cut away. Nothing important near any edge.",
  "product-hero":
    "Composition: a setting with a clear surface — a counter, a table, a shelf, a ledge — running across the middle of the frame. The middle band is the emptiest part of the image. The top and bottom fifths are calm and darker, because a headline sits at the top and a caption at the bottom.",
};

/*
  THE EMPTY STAGING AREA

  Appended whenever the piece carries a product, and it is the whole reason a
  product scene is a different job from a background.

  The model's instinct on being handed "a marble counter, morning light" is to
  put something photogenic on it — a bottle, a jar, a cup. Then the template
  composites the client's real product on top and the piece ships with two
  products in it, one of them invented. So the scene is asked for as an
  explicitly empty set: a place, a light and a surface with nothing standing on
  it.

  Stated as what to DO ("leave the centre clear") before what to avoid, because
  a prompt that is only a list of prohibitions tends to produce exactly what it
  forbids. The prohibitions are still spelled out afterwards — the failure here
  is expensive and silent, since a scene with its own bottle looks perfectly
  good until you notice the client's product is standing next to a stranger's.
*/
const PRODUCT_SCENE_DIRECTIVE = [
  "This is an empty set, photographed before the product arrives.",
  "Leave the central area of the frame completely clear and unobstructed: an empty surface, ready to have an object placed on it.",
  "Show the place, the light and the surface only.",
  "There is NO product, NO bottle, NO jar, NO box, NO packaging, NO container and NO merchandise anywhere in the image.",
  "No hands holding anything, no object at the centre of attention.",
  "Any props are peripheral, out of focus and away from the centre.",
].join(" ");

/*
  What separates a photograph from a stock image.

  Without this the model reliably produces the archetypal AI office photo:
  symmetrical, evenly lit, a laptop and a coffee cup, someone smiling at the
  camera. Naming the craft — lens, depth, imperfection — and naming the cliché to
  avoid moves it toward something that looks shot rather than rendered.
*/
const CRAFT_DIRECTIVE = [
  "Shot on a full-frame camera with a fast prime lens, shallow depth of field, natural imperfection in the framing.",
  "Real textures and surfaces, visible material detail, honest colour rather than heavy saturation.",
  "Avoid stock-photo clichés: no posed handshakes, no people smiling at the camera, no perfectly tidy desks,",
  "no symmetrical corporate compositions, no floating objects, no 3D renders, no illustration.",
].join(" ");

const FORMAT_HINT: Record<FormatKey, string> = {
  feed: "Vertical 4:5 framing.",
  story: "Tall vertical 9:16 framing, with the subject centred in the upper half.",
};

export function composeImagePrompt({
  brief,
  artDirection,
  format,
  templateSlug,
  hasProduct = false,
}: {
  brief: string;
  artDirection: ArtDirection;
  format: FormatKey;
  templateSlug: string;
  /**
   * Whether a real product will be composited into this scene afterwards.
   *
   * Passed as a boolean and not as the product itself, deliberately: naming the
   * product would tell the model what to draw, and the one thing it must not do
   * is draw it. What the scene should look like for THIS product is already
   * carried by the brief, which the copy model wrote knowing the product.
   */
  hasProduct?: boolean;
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

  // 3. Photographic craft, before composition: it describes HOW the frame is
  //    made, which the composition rules then place things within.
  parts.push(CRAFT_DIRECTIVE);

  // 4. Composition, so the type has somewhere to live.
  parts.push(FORMAT_HINT[format]);
  const composition = COMPOSITION_BY_TEMPLATE[templateSlug];
  if (composition) parts.push(composition);

  // 5. The staging area, AFTER the composition it constrains and before the
  //    exclusions. Placing it here means "leave the middle empty" is read as a
  //    refinement of the frame rather than as a competing instruction.
  if (hasProduct) parts.push(PRODUCT_SCENE_DIRECTIVE);

  // 6. Brand-specific exclusions, then the non-negotiable ones.
  const avoid = artDirection.avoid.map((item) => item.trim()).filter(Boolean);
  if (avoid.length > 0) {
    parts.push(`Avoid: ${avoid.join(", ")}.`);
  }
  parts.push(NO_TEXT_DIRECTIVE);

  return parts.join(" ");
}
