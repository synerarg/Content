import { contrastFromLuminance, relativeLuminance, type Rgb } from "@/lib/color";

/*
  Is the text on this slide actually readable?

  The Brand Kit editor already checks contrast — but it checks the PALETTE:
  foreground token against background token. That answers nothing about a
  headline sitting on a photograph, which is where the failure actually happens.
  A brand whose palette scores AAA still ships white type over a sky.

  ---------------------------------------------------------------------------
  Why this measures the RENDERED BITMAP and not the background image
  ---------------------------------------------------------------------------

  The obvious approach — sample the background image under the text — is wrong
  here, and wrong in the dangerous direction. Every photographic template lays a
  scrim over the image precisely to make type readable; measuring the raw
  photograph ignores the scrim and reports problems that do not exist, so the
  warning gets ignored, and then it is worthless when it is right.

  The alternative — teach the checker where each template puts its type and what
  protection it applies — duplicates layout knowledge that already exists in the
  component, and would silently go stale the first time a template changes. This
  codebase's rule is that the template is the source of truth.

  So the measurement is taken from the composited result: the same node the
  export rasterizes, drawn small. Scrims, product images, logos and any future
  template are all included for free, because none of them are modelled.

  ---------------------------------------------------------------------------
  What it costs
  ---------------------------------------------------------------------------

  It inherits the export's one hard constraint: html-to-image resolves its image
  loads inside a requestAnimationFrame callback, and rAF does not fire in a
  hidden tab. A check run in a background tab never settles. Same guard as
  lib/export/rasterize.ts, same reason.
*/

/** One run of text found in the rendered slide. */
export type TextBox = {
  /** The text itself, truncated — far more useful in a warning than a slot key. */
  label: string;
  color: Rgb;
  /** Font size in slide pixels, i.e. on the 1080-wide canvas. */
  fontSize: number;
  /** Normalised to 0..1 against the slide, so the bitmap can be any scale. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LegibilityFinding = {
  label: string;
  ratio: number;
  required: number;
  ok: boolean;
};

export type LegibilityReport = {
  findings: LegibilityFinding[];
  /** The finding that fails hardest, or the tightest passing one. */
  worst: LegibilityFinding | null;
  ok: boolean;
  /** True when nothing could be measured — no text, or no readable pixels. */
  empty: boolean;
};

/*
  A 1080px-wide slide is read on a phone at roughly 400px.

  WCAG's size thresholds are about the size the reader actually perceives, so an
  88px headline is NOT "88px large text" — it lands around 33px on the phone,
  which is still large. A 25px detail line lands near 9px, which is small and
  needs the full 4.5:1. Getting this backwards would wave through exactly the
  small print that is hardest to read.
*/
export const PHONE_SCALE = 400 / 1080;

/** WCAG 2.1: large text passes at 3:1, everything else needs 4.5:1. */
export function requiredRatio(fontSizeOnSlide: number): number {
  return fontSizeOnSlide * PHONE_SCALE >= 24 ? 3 : 4.5;
}

/** Below this many pixels the box is not worth judging. */
const MIN_BACKGROUND_PIXELS = 24;

/**
 * Percentile of a sorted array, without interpolating.
 *
 * Used instead of the mean on purpose. A headline crossing a scrim that is dark
 * on the left and bright on the right averages out to "fine" while being
 * unreadable across half its length; the reader does not experience the mean.
 * Taking the worst realistic slice — the 90th percentile of brightness under
 * light text, the 10th under dark text — measures the part that actually fails,
 * while ignoring the handful of extreme pixels that a strict min/max would
 * trip over.
 */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

export type Bitmap = {
  width: number;
  height: number;
  /** RGBA, as ImageData carries it. */
  data: Uint8ClampedArray;
};

/**
 * Measure every text box against the pixels behind it.
 *
 * `bitmap` MUST be the slide rendered with its text hidden — every pixel in it
 * is treated as background. That requirement replaced the obvious alternative,
 * which was to render normally and classify each pixel as glyph or background
 * by how close it is to the text colour. That heuristic is not merely
 * imprecise, it fails in the one direction that matters: a bright sky is close
 * enough to white type to be classified AS the type and thrown away, so the
 * check measured only the dark part of the frame and reported a comfortable
 * pass on a headline that had vanished into the sky. Caught by the crossing
 * case in scripts/verify-legibility.ts, which is why that case is in there.
 *
 * Pure: no DOM, no canvas. Everything that decides anything lives here, which
 * is the point — the browser plumbing around it cannot be tested from a script.
 */
export function analyzeTextBoxes(
  bitmap: Bitmap,
  boxes: TextBox[],
): LegibilityReport {
  const findings: LegibilityFinding[] = [];

  for (const box of boxes) {
    const left = Math.max(0, Math.floor(box.x * bitmap.width));
    const top = Math.max(0, Math.floor(box.y * bitmap.height));
    const right = Math.min(
      bitmap.width,
      Math.ceil((box.x + box.width) * bitmap.width),
    );
    const bottom = Math.min(
      bitmap.height,
      Math.ceil((box.y + box.height) * bitmap.height),
    );

    if (right <= left || bottom <= top) continue;

    const textLuminance = relativeLuminance(box.color);
    const backgroundLuminances: number[] = [];

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const index = (y * bitmap.width + x) * 4;
        backgroundLuminances.push(
          relativeLuminance([
            bitmap.data[index],
            bitmap.data[index + 1],
            bitmap.data[index + 2],
          ]),
        );
      }
    }

    if (backgroundLuminances.length < MIN_BACKGROUND_PIXELS) continue;

    backgroundLuminances.sort((a, b) => a - b);
    // Light text fails against the brightest background it crosses; dark text
    // fails against the darkest.
    const worstBackground =
      textLuminance > 0.5
        ? percentile(backgroundLuminances, 0.9)
        : percentile(backgroundLuminances, 0.1);

    const ratio = contrastFromLuminance(textLuminance, worstBackground);
    const required = requiredRatio(box.fontSize);

    findings.push({
      label: box.label,
      ratio: Math.round(ratio * 10) / 10,
      required,
      ok: ratio >= required,
    });
  }

  if (findings.length === 0) {
    return { findings: [], worst: null, ok: true, empty: true };
  }

  // Worst = furthest below its own threshold, so a 2.9 against 3.0 does not
  // outrank a 2.0 against 4.5.
  const worst = findings.reduce((current, finding) =>
    finding.ratio - finding.required < current.ratio - current.required
      ? finding
      : current,
  );

  return {
    findings,
    worst,
    ok: findings.every((finding) => finding.ok),
    empty: false,
  };
}

// ---------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------

const RGB_RE = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/;

export function parseCssRgb(value: string): Rgb | null {
  const match = RGB_RE.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Enough to identify the run in a warning without wrapping the line. */
function labelFor(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 34 ? `${clean.slice(0, 34)}…` : clean;
}

/**
 * Every element in the slide that directly renders text.
 *
 * "Directly" matters: a wrapper div contains all its children's text, and
 * measuring its bounding box would sample the whole slide and report nonsense.
 * Only elements with their own non-empty text node are collected.
 */
export function collectTextBoxes(
  root: HTMLElement,
): Array<TextBox & { element: HTMLElement }> {
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width === 0 || rootRect.height === 0) return [];

  const boxes: Array<TextBox & { element: HTMLElement }> = [];

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const ownText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();

    if (!ownText) continue;

    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;

    const color = parseCssRgb(style.color);
    if (!color) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    boxes.push({
      element,
      label: labelFor(ownText),
      color,
      // Reported in slide pixels: the node is rendered at full size, so the
      // computed font size already is one.
      fontSize: Number.parseFloat(style.fontSize) || 16,
      x: (rect.left - rootRect.left) / rootRect.width,
      y: (rect.top - rootRect.top) / rootRect.height,
      width: rect.width / rootRect.width,
      height: rect.height / rootRect.height,
    });
  }

  return boxes;
}

/**
 * Hide the glyphs, keeping everything else the element paints.
 *
 * `color: transparent`, not `visibility: hidden`, and the difference is not
 * cosmetic: a CTA pill carries its own background colour on the very element
 * that holds its text. Hiding the element would take the pill with it and the
 * check would measure the photograph behind it — reporting a contrast problem
 * on the one run that is guaranteed not to have one.
 *
 * Returns the undo. The caller MUST run it, including on failure.
 */
export function hideGlyphs(
  boxes: Array<{ element: HTMLElement }>,
): () => void {
  const restore = boxes.map(({ element }) => {
    const previous = element.style.color;
    element.style.color = "transparent";
    return () => {
      element.style.color = previous;
    };
  });

  return () => {
    for (const undo of restore) undo();
  };
}
