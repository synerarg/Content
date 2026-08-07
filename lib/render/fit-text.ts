/*
  Type sizing that responds to how much text there is.

  Every template used a fixed headline size — 88px on feed, 104px on story —
  regardless of whether the headline was 20 characters or 90. A short one at
  88px looks deliberate; a long one becomes a four-line wall that fills the
  card and reads as a template someone poured text into. That "poured in" look
  is a large part of why the output reads as generated rather than designed.

  Deliberately a lookup by length rather than measuring the rendered text.
  Measurement would mean laying out, reading back, and re-rendering — inside
  html-to-image's `<foreignObject>` serialization, which is the one place this
  project cannot afford extra moving parts. Steps tuned against the character
  limits each slot's zod schema already enforces, so the ranges are bounded and
  known rather than open-ended.
*/

export type FitScale = {
  /** Size for the shortest copy. */
  max: number;
  /** Size once the copy is at the slot's limit. */
  min: number;
  /** Character count at which shrinking starts. Below this, always `max`. */
  from: number;
  /** Character count at which `min` is reached. */
  to: number;
};

/**
 * Interpolate a font size for `text` within a scale.
 *
 * Rounded to whole pixels: sub-pixel type sizes render inconsistently across
 * the preview and the rasterized export, and the two matching is the product's
 * central promise.
 */
export function fitTextSize(text: string, scale: FitScale): number {
  const length = text.trim().length;
  if (length <= scale.from) return scale.max;
  if (length >= scale.to) return scale.min;

  const ratio = (length - scale.from) / (scale.to - scale.from);
  return Math.round(scale.max - ratio * (scale.max - scale.min));
}

/**
 * Line height that tightens as type gets bigger.
 *
 * Large display type needs proportionally less leading than small type — the
 * same 1.04 that looks right at 88px looks gappy at 44px. This is the one
 * typographic rule that, left unapplied, makes carefully chosen sizes still
 * look wrong.
 */
export function fitLineHeight(size: number): number {
  if (size >= 80) return 1.02;
  if (size >= 56) return 1.08;
  if (size >= 40) return 1.16;
  return 1.28;
}
