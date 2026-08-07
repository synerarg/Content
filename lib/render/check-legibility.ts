import { toCanvas } from "html-to-image";
import { ensureFontsLoaded, type BrandFontRow } from "@/lib/render/brand-tokens";
import {
  analyzeTextBoxes,
  collectTextBoxes,
  hideGlyphs,
  type LegibilityReport,
} from "@/lib/render/legibility";

/*
  The browser half of the legibility check.

  Kept apart from lib/render/legibility.ts so that file stays importable from a
  plain Node script: everything worth testing — the classification, the
  percentile, the WCAG thresholds — lives there, and html-to-image cannot be
  loaded outside a browser.
*/

/**
 * A quarter scale: 270x338 for a feed slide.
 *
 * Contrast is an average over an area, so resolution buys nothing here — and a
 * check that took as long as the export would not get run. Small enough that
 * checking eight slides is a couple of seconds, large enough that a headline
 * still covers a few thousand pixels.
 */
const SAMPLE_SCALE = 0.25;

const TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "El chequeo de legibilidad tardó demasiado. Suele pasar si la pestaña quedó en segundo plano.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkSlideLegibility({
  node,
  width,
  height,
  fontCss,
  fonts,
}: {
  node: HTMLElement;
  width: number;
  height: number;
  fontCss: string;
  fonts: BrandFontRow[];
}): Promise<LegibilityReport> {
  // Same constraint as the export, same reason: html-to-image resolves its
  // image loads inside a requestAnimationFrame callback, and rAF never fires in
  // a hidden tab. Fail with the actual reason rather than hanging.
  if (typeof document !== "undefined" && document.hidden) {
    throw new Error(
      "La pestaña tiene que estar visible para revisar la legibilidad. Volvé a esta pestaña y probá de nuevo.",
    );
  }

  await ensureFontsLoaded(fonts);

  // Boxes come from the LIVE DOM, not from the bitmap: it is the only place the
  // text colour and the font size are known, and reading them back out of
  // pixels would be guesswork.
  const boxes = collectTextBoxes(node);
  if (boxes.length === 0) {
    return { findings: [], worst: null, ok: true, empty: true };
  }

  const options = {
    width,
    height,
    pixelRatio: SAMPLE_SCALE,
    fontEmbedCSS: fontCss,
    style: { transform: "none", transformOrigin: "top left", margin: "0" },
  };

  /*
    The slide is rendered with its TEXT HIDDEN, so every pixel measured is
    genuinely background and nothing has to be guessed. See analyzeTextBoxes for
    what the alternative — classifying pixels by how close they are to the text
    colour — got wrong, and why it got it wrong in the dangerous direction.

    The restore runs in `finally`: leaving the offscreen node with transparent
    text would silently poison the next EXPORT, which reads the same node.
  */
  const restore = hideGlyphs(boxes);

  try {
    /*
      A discarded warm-up pass, exactly as the export does, and here it is not
      an optimisation — it is correctness. On a cold first pass the background
      image may not have resolved, so the slide renders on the brand's flat
      background colour, which almost always has excellent contrast. The check
      would report a clean pass on the very slide that fails. A false alarm is
      annoying; a false all-clear is the failure this feature exists to prevent.
    */
    await withTimeout(toCanvas(node, options), TIMEOUT_MS);
    const canvas = await withTimeout(toCanvas(node, options), TIMEOUT_MS);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("El navegador no pudo leer los píxeles de la placa.");
    }

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return analyzeTextBoxes(
      { width: image.width, height: image.height, data: image.data },
      boxes,
    );
  } finally {
    restore();
  }
}
