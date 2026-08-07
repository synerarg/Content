import { toPng, toSvg } from "html-to-image";
import { ensureFontsLoaded, type BrandFontRow } from "@/lib/render/brand-tokens";

/*
  Turning a rendered slide into a PNG.

  The requirement is that the downloaded file is pixel-identical to what the
  user approved on screen. Three things threaten that, and each has a specific
  countermeasure here:

  1. FONTS. html-to-image serializes into an SVG <foreignObject>, a separate
     document where webfonts often fail to resolve before capture. Countered by
     embedding fonts as data URIs upstream (see lib/render/brand-tokens.ts),
     passing that CSS as `fontEmbedCSS`, and awaiting the specific faces first.

  2. CROSS-ORIGIN IMAGES. Backgrounds and logos live in Supabase Storage, a
     different origin. Drawing a cross-origin image taints the canvas and
     toPng() throws SecurityError outright. Countered by converting every remote
     asset to a same-origin blob: URL before it is ever rendered.

  3. SCALING. The editor previews at a CSS transform scale. Rasterizing the
     scaled node would capture the scaled geometry, so export renders a separate
     node at exact pixel size with pixelRatio 1 — nothing is ever upscaled.
*/

export type RasterizeOptions = {
  node: HTMLElement;
  width: number;
  height: number;
  /** Self-contained @font-face rules with the .woff2 bytes inlined. */
  fontCss: string;
  fonts: BrandFontRow[];
};

/**
 * Fetch a remote asset and hand back a same-origin blob: URL.
 *
 * Blob URLs created by the page are same-origin by definition, so an <img>
 * using one never taints the canvas. This is more deterministic than relying on
 * Storage CORS headers plus crossOrigin="anonymous", and it removes a
 * deployment-config dependency from the export path.
 */
export async function toObjectUrl(remoteUrl: string): Promise<string> {
  const res = await fetch(remoteUrl, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`No se pudo descargar el recurso (${res.status}).`);
  }
  return URL.createObjectURL(await res.blob());
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Generous enough for a 1080x1920 slide on a slow machine, short enough to not look frozen. */
const RASTERIZE_TIMEOUT_MS = 45_000;

/*
  ---------------------------------------------------------------------------
  The warm-up pass, and why it stopped being a second full render
  ---------------------------------------------------------------------------

  This used to call `toPng` twice and throw the first result away — a
  1080x1350 canvas draw plus a PNG encode, discarded, once per slide. On a
  batch of eight that is eight wasted full-resolution rasterizations, and it is
  the slowest thing in the app.

  What the warm-up is FOR is stated in the original comment: populating
  html-to-image's internal cache of embedded resources. That cache is a
  module-level object in the library keyed by resource URL
  (node_modules/html-to-image/lib/dataurl.js), and it is filled by
  `embedImages` / `embedWebFonts` — both of which run inside `toSvg`. `toCanvas`
  simply calls `toSvg` and then draws the result. So `toSvg` does the entire job
  the warm-up exists to do, and skips the two expensive steps that follow it.

  Two more things make the real pass more deterministic rather than less:

    - every <img> in the node is decoded first, so the bytes are in memory
      before the library goes looking for them;
    - resources already warmed in this session are remembered, so the second
      slide of a carousel does not re-warm the logo it shares with the first.

  HONEST STATUS: this cannot be verified from an agent session. HANDOFF §6 is
  explicit that the rasterizer needs a human with a visible tab — rAF does not
  fire in a hidden one, so `toPng` hangs rather than failing. The argument above
  is read off the library's source, not off a run. If an exported PNG ever comes
  back missing its background, restoring the old behaviour is one line: make
  `warmUp` call `toPng` instead of `toSvg`.
*/
const warmedResources = new Set<string>();

/** Every remote-ish image the node will make the library fetch and inline. */
function imageSources(node: HTMLElement): string[] {
  return Array.from(node.querySelectorAll("img"))
    .map((image) => image.src)
    .filter((src) => src && !src.startsWith("data:"));
}

/**
 * Get the browser to finish decoding the node's images before serialization.
 *
 * Cheap when they are already decoded, which they usually are — the preview has
 * been showing them. A rejection is ignored on purpose: `decode()` throwing
 * means this image was going to be a problem anyway, and failing the export
 * here would replace a possibly-fine render with a certain failure.
 */
async function decodeImages(node: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((image) =>
      image.decode().catch(() => undefined),
    ),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function rasterizeSlide({
  node,
  width,
  height,
  fontCss,
  fonts,
}: RasterizeOptions): Promise<Blob> {
  // html-to-image resolves its internal image load inside a
  // requestAnimationFrame callback, and rAF does not fire in a hidden tab. A
  // backgrounded export therefore never settles — no error, no result. Verified
  // directly: with document.hidden === true, rAF never fires while
  // Image.onload still does.
  //
  // We cannot complete in that state, so fail fast with the actual reason
  // instead of leaving a spinner running forever.
  if (typeof document !== "undefined" && document.hidden) {
    throw new Error(
      "La pestaña tiene que estar visible para exportar. Volvé a esta pestaña y probá de nuevo.",
    );
  }

  await ensureFontsLoaded(fonts);

  const options = {
    width,
    height,
    // The node is already at full size. Anything other than 1 would resample.
    pixelRatio: 1,
    // Fonts are pre-inlined, so this makes html-to-image's own stylesheet scan
    // a no-op instead of a cross-origin CSSOM read that can silently yield
    // nothing.
    fontEmbedCSS: fontCss,
    // Defeat any transform the offscreen host applies.
    style: {
      transform: "none",
      transformOrigin: "top left",
      margin: "0",
    },
  };

  const timeoutMessage =
    "La exportación tardó demasiado. Suele pasar si la pestaña quedó en segundo plano durante el proceso.";

  await decodeImages(node);

  // Skip the warm-up entirely when nothing in this node is new. A carousel's
  // later slides share a logo and a product with the first, and a purely
  // typographic template has no images at all.
  const sources = imageSources(node);
  const unwarmed = sources.filter((src) => !warmedResources.has(src));

  if (unwarmed.length > 0) {
    await withTimeout(toSvg(node, options), RASTERIZE_TIMEOUT_MS, timeoutMessage);
    for (const src of sources) warmedResources.add(src);
  }

  const dataUrl = await withTimeout(
    toPng(node, options),
    RASTERIZE_TIMEOUT_MS,
    timeoutMessage,
  );

  return dataUrlToBlob(dataUrl);
}

/**
 * Forget every warmed resource.
 *
 * Hygiene rather than correctness: blob URLs are revoked when a batch page
 * unmounts and the next page mints new ones, so the set would otherwise grow
 * for the life of the tab holding strings that can never match again. A stale
 * entry cannot cause a wrong skip — blob URLs carry a fresh UUID and an
 * uploaded asset gets a new path — it is just memory nobody will use again.
 */
export function resetRasterizeCache(): void {
  warmedResources.clear();
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has started reading.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Read a PNG blob's intrinsic dimensions — used to verify export size. */
export async function readPngDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo leer el PNG."));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
