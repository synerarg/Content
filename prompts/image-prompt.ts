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
  product is composited into that space afterwards. VERIFIED LIVE: the identical
  brief loaded the table with props without this block and returned a bare
  surface with it.

  2026-08-07.3 — the scene reference. When the product photo itself is sent to
  the model, the prompt has to say what it is FOR. A photograph arriving with no
  explanation reads as "draw this", which is the one thing it must not mean.

  2026-08-07.4 — take the light, not the colour. .3 worked — the scene came back
  empty and visibly matched — but it matched too much: handed a dark olive
  bottle it returned a kitchen whose window frame and shutters were painted the
  same olive green. A set the colour of the product is a set the product
  disappears into, and the product is the subject. Verified live: the same
  reference under .4 keeps the light and drops the colour match.

  2026-08-07.5 — carousel continuity. A carousel's slides were four unrelated
  photographs; seeds cannot fix it because Gemini ignores them. The first
  slide's background now goes to every later slide as a reference, asking for
  the same PLACE and a different FRAME.
*/
export const IMAGE_PROMPT_VERSION = "2026-08-07.5";

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
  /*
    A single figure at ~300px sits in the middle of this one, so the image is
    asked for as atmosphere and nothing else. Naming what it should BE — light,
    depth, texture — rather than only what to leave out, because a prompt that
    is purely prohibition tends to produce the thing it forbids.
  */
  "big-number":
    "Composition: almost abstract and extremely simple — soft directional light falling across a plain surface, deep shadow, or heavily out-of-focus texture. No recognisable object, no horizon, no busy detail anywhere. The centre of the frame is the emptiest and darkest part of the image, because one enormous figure sits there.",
  "feature-stack":
    "Composition: the subject sits in the TOP third only and is the single point of interest. The lower two thirds fall away into calm, even, darkening tone — a surface, a wall, soft falloff — with nothing the eye needs to read, because a stack of panels covers that area entirely.",
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
  WHAT THE ATTACHED PHOTOGRAPH IS FOR

  Appended only when a reference image actually travels with the request, and it
  exists because of what a bare photograph means to a model: "draw this". That
  is the single thing it must not mean here — the product's real pixels are
  composited by the template afterwards, and a redrawn label is gibberish.

  So the reference is named as a LIGHTING AND CAMERA brief. It says what to take
  from the image (the direction and quality of the light, the height and angle
  of the camera, how the surface should reflect) and repeats, in the same
  breath, that the object itself must not appear. Repetition is deliberate: the
  no-product rule is already stated above, and sending a picture of the product
  is the strongest possible argument against it.
*/
const SCENE_REFERENCE_DIRECTIVE = [
  "An image is attached for reference ONLY.",
  "It shows the object that will be placed into this scene LATER, by someone else.",
  "Take from it ONLY the light and the camera: the direction and hardness of the light, the length and edge of the shadows, the height and angle of the camera, and how surfaces should reflect.",
  "Do NOT take its colour. The set must NOT be painted in the object's own colours.",
  "The surfaces behind and beneath the object should CONTRAST with it in tone and hue, so that when it is placed there it separates clearly from its background.",
  "Do NOT draw, reproduce, include or imitate the object in the attached image.",
  "The object must be completely absent from the frame. Its place stays empty.",
].join(" ");

/*
  CAROUSEL CONTINUITY

  A carousel's slides were four unrelated photographs. The shared
  `background_brief` gave them a shared subject and nothing else — different
  room, different light, different palette — and seeds cannot fix it, because
  Gemini ignores them entirely (HANDOFF §10).

  What DOES fix it is the mechanism built for product scenes: the first slide's
  background is handed to the model as a reference for every slide after it.

  The hard part is asking for the same PLACE without asking for the same PICTURE.
  A reference with no instruction produces a near-copy, and four near-identical
  frames are a different kind of bad carousel — so the difference is named as
  explicitly as the sameness, and what may change (angle, crop, distance) is
  listed separately from what may not (place, light, palette, materials).
*/
const CAROUSEL_CONTINUITY_DIRECTIVE = [
  "An image is attached: it is another photograph from THIS SAME SET, taken moments earlier.",
  "Keep the same location, the same light, the same time of day, the same colour palette and the same materials, so the two read as one shoot.",
  "But this is a DIFFERENT FRAME, not a copy: change the camera angle, the distance and what is in shot.",
  "Do not reproduce the attached image or repeat its composition.",
].join(" ");

/*
  A NAMED shot per slide, because "a different frame" was not enough.

  Measured: with the continuity directive alone, slide 2 came back as very
  nearly the anchor's framing with a person moved, while slide 3 did genuinely
  move in. Cohesion was solved and variety was a coin flip — and four copies of
  one photograph is as bad a carousel as four unrelated ones.

  So each slide is told WHICH shot it is, the way a photographer would be
  briefed on a shoot: wide, detail, opposite angle, low. Concrete instructions
  a model can follow, instead of an abstract instruction to differ.

  Indexed from slide 1 — slide 0 is the anchor and gets none of this — and it
  wraps, so a carousel of eight simply revisits the cycle from a different
  starting scene.
*/
const CAROUSEL_FRAMING = [
  "This frame is a WIDE shot: step back and show more of the room than the attached image does.",
  "This frame is a CLOSE detail: move in on one surface or object within the same space, filling the frame with it.",
  "This frame is shot from a LOW angle, close to a surface, with the space receding behind it.",
  "This frame is shot from the OPPOSITE side of the room, looking back the other way.",
];

/*
  The order is not arbitrary, and the last entry is the weak one.

  Measured over a four-slide run: WIDE and CLOSE DETAIL both produced genuinely
  different frames of the same place. OPPOSITE SIDE did not — it came back close
  to the wide shot. That is explicable rather than mysterious: the model can see
  only one photograph, so it has no information about what is BEHIND the camera
  and falls back on re-rendering the view it knows.

  So the two that work run first, LOW ANGLE — which is derivable from the same
  view — runs third, and OPPOSITE SIDE runs fourth, where only a carousel of
  five or more slides reaches it. Reordering is measured; the entries themselves
  are unchanged from the run.
*/

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
  referenceKind = null,
  slideIndex = 0,
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
  /**
   * What is actually TRAVELLING with this request, if anything.
   *
   * Null unless bytes are genuinely attached. Separate from `hasProduct` on
   * purpose: a piece can carry a product while the configured provider cannot
   * take a reference image at all (fal today), and telling a model about "the
   * attached image" when nothing is attached is an instruction it cannot
   * follow — worse than saying nothing. The route asks the provider first.
   */
  referenceKind?: "product" | "scene" | null;
  /**
   * This slide's position within its carousel, 0-based.
   *
   * Only consulted for a `scene` reference, where it picks which named shot
   * this frame should be. Slide 0 is the anchor and never has one.
   */
  slideIndex?: number;
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

  // 6. What the attached photograph is for, immediately after the rule it is
  //    most likely to undermine.
  if (referenceKind === "product") {
    parts.push(SCENE_REFERENCE_DIRECTIVE);
  } else if (referenceKind === "scene") {
    parts.push(CAROUSEL_CONTINUITY_DIRECTIVE);
    // Slide 1 gets the first shot in the cycle, so the offset is index - 1.
    const framing =
      CAROUSEL_FRAMING[(Math.max(1, slideIndex) - 1) % CAROUSEL_FRAMING.length];
    if (framing) parts.push(framing);
  }

  // 7. Brand-specific exclusions, then the non-negotiable ones.
  const avoid = artDirection.avoid.map((item) => item.trim()).filter(Boolean);
  if (avoid.length > 0) {
    parts.push(`Avoid: ${avoid.join(", ")}.`);
  }
  parts.push(NO_TEXT_DIRECTIVE);

  return parts.join(" ");
}
