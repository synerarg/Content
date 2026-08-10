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

/**
 * Letter-spacing that tightens as type gets bigger, the same idea as
 * `fitLineHeight` applied to tracking instead of leading.
 *
 * Before this, every template picked one fixed tracking value (anywhere from
 * -0.015em to -0.045em, chosen ad hoc per file) and used it at every size
 * `fitTextSize` could produce for that slot — the same value for a headline at
 * its 90-character floor and its 20-character ceiling. Large letterforms read
 * too far apart as they scale up; tightening only matters once type is
 * actually large, which is why this is continuous rather than tiered — a
 * headline one character longer must not visibly snap to a different tracking
 * value the way a tiered lookup would.
 *
 * MUST be applied directly on the element whose `fontSize` is `size` — never
 * on an ancestor. `letter-spacing` in `em` resolves against the computed
 * font-size of the element it is SET ON, and inherits as an already-resolved
 * absolute length from there. Set it on a wrapper with no `fontSize` of its
 * own and every differently-sized child inherits the same fixed pixel value
 * regardless of its own size — silently reintroducing the exact "one value
 * for every size" problem this function exists to fix.
 */
export function fitLetterSpacing(size: number): string {
  const MAX_SIZE = 100;
  const MIN_SIZE = 40;
  const MAX_TRACKING = -0.03;
  const MIN_TRACKING = -0.01;

  if (size >= MAX_SIZE) return `${MAX_TRACKING}em`;
  if (size <= MIN_SIZE) return `${MIN_TRACKING}em`;

  const ratio = (size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
  const tracking = MIN_TRACKING + ratio * (MAX_TRACKING - MIN_TRACKING);
  return `${tracking.toFixed(4)}em`;
}
