/*
  Product photos, prepared in the browser before they are uploaded.

  Three jobs, all of which have to happen client-side:

  1. RESIZE. `brand-assets` caps objects at 2 MiB (migration 0007) and a phone
     photo is routinely 4-8 MB. Raising the bucket limit was the alternative and
     is the wrong trade: a product is composited into a 1080px-wide slide, so
     anything past ~1600px on the long edge is bytes nobody will ever see. And
     the bytes cannot be resized on the way through — uploads go browser ->
     signed URL -> Storage precisely so they never touch a Vercel function.

  2. DETECT ALPHA. Whether the image has a real cut-out decides which templates
     it can be used with, and it cannot be inferred from the extension: most
     PNGs are opaque. Measured here, stored on the row.

  3. OPTIONALLY CUT OUT a flat studio backdrop. See removeFlatBackground below
     for what this does and, more importantly, what it refuses to do.

  Everything here runs on canvas APIs and adds no dependency. That is a
  deliberate ceiling: a real matting model (U^2-Net / RMBG and friends) would cut
  a product out of any background, and every browser-side package that ships one
  today carries either an AGPL licence or model weights licensed for
  non-commercial use only. That is an account-owner decision, not one to make
  inside a helper. Until it is made, this handles the plain-backdrop case that
  covers most e-commerce photography and says so plainly when it cannot.
*/

/** Long edge of the stored image. A slide is 1080px wide; this is headroom. */
const MAX_EDGE = 1600;
/** Below this the product starts to look soft against a 1080px slide. */
const MIN_EDGE = 720;
/** The bucket's hard cap is 2 MiB. Stop short of it. */
const TARGET_BYTES = 1_800_000;

/** Any pixel below this is treated as "not fully opaque". */
const OPAQUE_ALPHA = 250;
/** Below this share of soft pixels an image reads as a plain opaque photo. */
const TRANSPARENCY_RATIO = 0.005;

export type CutoutOutcome =
  | { status: "skipped" }
  | { status: "already-transparent" }
  | { status: "done"; removedRatio: number }
  | { status: "refused"; reason: string };

export type PreparedProductImage = {
  file: File;
  hasTransparency: boolean;
  width: number;
  height: number;
  cutout: CutoutOutcome;
};

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  // `imageOrientation` applies the EXIF rotation a phone writes instead of
  // baking in a sideways product. Browsers that do not know the option ignore
  // it rather than throwing.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo leer la imagen."));
      image.src = url;
    });
    return image;
  } finally {
    // Safe to revoke: decoding has finished and the pixels are in memory.
    URL.revokeObjectURL(url);
  }
}

function drawAt(
  source: CanvasImageSource & { width: number; height: number },
  maxEdge: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no pudo procesar la imagen.");

  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

// ---------------------------------------------------------------------------
// Alpha
// ---------------------------------------------------------------------------

function measureTransparency(image: ImageData): boolean {
  const { data } = image;
  let soft = 0;
  // Every 4th pixel. A cut-out has thousands of soft pixels along its edge, so
  // sampling cannot miss one, and this keeps a 2.5 MP scan cheap.
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < OPAQUE_ALPHA) soft++;
  }
  return soft / (data.length / 16) > TRANSPARENCY_RATIO;
}

// ---------------------------------------------------------------------------
// Flat-backdrop cut-out
// ---------------------------------------------------------------------------

/** Corners must agree with each other by at least this much to count as a backdrop. */
const CORNER_TOLERANCE = 46;
/** How far a pixel may drift from the backdrop colour and still be background. */
const FILL_TOLERANCE = 40;

type Rgb = [number, number, number];

function patchAverage(image: ImageData, cx: number, cy: number, radius: number): Rgb {
  const { width, height, data } = image;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }

  return [r / n, g / n, b / n];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Erase a flat backdrop by flooding inward from the corners.
 *
 * This is a connected fill, not a colour key: a white shirt in the middle of the
 * product survives because the flood never reaches it. What it cannot do is
 * separate a product from a desk, a hand or a room — for that the answer is a
 * matting model, and the note at the top of this file explains why there is not
 * one here.
 *
 * The guard rails matter more than the algorithm. Removing 2% of an image means
 * it found nothing; removing 98% means it ate the product. In both cases this
 * returns a refusal and the caller keeps the original, because a silently
 * mangled product photo is far worse than one that was never cut out.
 *
 * Exported for `scripts/verify-products.ts`, which is the only way those guard
 * rails get tested: everything around this function needs a canvas, but this
 * one touches nothing but the `{width, height, data}` it is handed.
 */
export function removeFlatBackground(image: ImageData): CutoutOutcome {
  const { width, height, data } = image;
  const total = width * height;

  const corners: Rgb[] = [
    patchAverage(image, 0, 0, 8),
    patchAverage(image, width - 1, 0, 8),
    patchAverage(image, 0, height - 1, 8),
    patchAverage(image, width - 1, height - 1, 8),
  ];

  const mean: Rgb = [
    corners.reduce((s, c) => s + c[0], 0) / corners.length,
    corners.reduce((s, c) => s + c[1], 0) / corners.length,
    corners.reduce((s, c) => s + c[2], 0) / corners.length,
  ];

  const agreeing = corners.filter((c) => distance(c, mean) <= CORNER_TOLERANCE);
  if (agreeing.length < 3) {
    return {
      status: "refused",
      reason:
        "La foto no tiene un fondo plano: las esquinas son muy distintas entre sí. Subí el producto sobre un fondo liso, o subilo ya recortado en PNG.",
    };
  }

  // Flood fill inward from every corner at once.
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const push = (index: number) => {
    if (seen[index]) return;
    const i = index * 4;
    if (distance([data[i], data[i + 1], data[i + 2]], mean) > FILL_TOLERANCE) return;
    seen[index] = 1;
    queue[tail++] = index;
  };

  push(0);
  push(width - 1);
  push((height - 1) * width);
  push(height * width - 1);

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;

    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  const removed = tail;
  const ratio = removed / total;

  if (ratio < 0.03) {
    return {
      status: "refused",
      reason:
        "No se encontró un fondo para recortar. Probá con una foto sobre fondo liso, o subila ya recortada en PNG.",
    };
  }
  if (ratio > 0.97) {
    return {
      status: "refused",
      reason:
        "El recorte se comió casi toda la imagen. El producto se confunde con el fondo: probá con más contraste entre los dos.",
    };
  }

  /*
    Erode by one pixel, then soften.

    The pixels right at the boundary are a blend of product and backdrop, so
    leaving them in paints a white halo around the product the moment it lands
    on a dark scene — the single most recognisable "badly cut out" signal there
    is. Dropping one pixel of a 1600px image costs nothing and removes it.
  */
  const alpha = new Uint8ClampedArray(total);
  for (let index = 0; index < total; index++) {
    alpha[index] = seen[index] ? 0 : 255;
  }

  const eroded = new Uint8ClampedArray(alpha);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (alpha[index] === 0) continue;
      if (
        (x > 0 && alpha[index - 1] === 0) ||
        (x < width - 1 && alpha[index + 1] === 0) ||
        (y > 0 && alpha[index - width] === 0) ||
        (y < height - 1 && alpha[index + width] === 0)
      ) {
        eroded[index] = 0;
      }
    }
  }

  // 3x3 box blur on the matte only — antialiasing for the new edge, so it does
  // not read as a paper cut-out.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += eroded[yy * width + xx];
          n++;
        }
      }
      data[index * 4 + 3] = sum / n;
    }
  }

  return { status: "done", removedRatio: ratio };
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo codificar la imagen."))),
      type,
      quality,
    );
  });
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Encode, and derive the extension from what the encoder ACTUALLY produced.
 *
 * `canvas.toBlob` is specified to fall back to PNG when it does not support the
 * requested type, silently — the callback still fires, with a perfectly valid
 * blob of a different format. Naming the file from the type we asked for would
 * then write `.webp` onto PNG bytes, and `withDeclaredType()` in lib/storage.ts
 * would dutifully label them `image/webp` on the way into Storage, because it
 * derives the MIME from the extension. Reading `blob.type` back closes that.
 */
async function encode(
  canvas: HTMLCanvasElement,
  hasAlpha: boolean,
): Promise<{ blob: Blob; extension: string }> {
  // WebP for both cases: it keeps the alpha channel a cut-out needs and is
  // several times smaller than PNG for photographic content.
  const blob = await toBlob(canvas, "image/webp", 0.92);
  const extension = EXTENSION_BY_TYPE[blob.type];

  if (extension && (blob.type !== "image/jpeg" || !hasAlpha)) {
    return { blob, extension };
  }

  // Either an unknown type came back, or a JPEG did for an image with alpha —
  // which would flatten the cut-out onto black. PNG is the safe answer.
  const png = await toBlob(canvas, "image/png", 1);
  return { blob: png, extension: "png" };
}

function baseName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const slug = withoutExtension
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "producto";
}

// ---------------------------------------------------------------------------

/**
 * Decode, resize, optionally cut out, and re-encode a product photo.
 *
 * Returns a File small enough for the bucket, plus what is now known about it.
 * A refused cut-out is not an error: the image is still uploaded, unmodified
 * apart from the resize, and the caller decides what to tell the user.
 */
export async function prepareProductImage(
  file: File,
  options: { removeBackground: boolean } = { removeBackground: false },
): Promise<PreparedProductImage> {
  const source = await decode(file);

  let maxEdge = MAX_EDGE;
  let cutout: CutoutOutcome = { status: "skipped" };
  let hasTransparency = false;
  let result: { blob: Blob; extension: string } | null = null;
  let canvas: HTMLCanvasElement | null = null;

  // Re-encode at a smaller size if the first pass lands over the bucket limit.
  // Rare at 1600px, but a highly detailed PNG cut-out can get there.
  for (let attempt = 0; attempt < 3; attempt++) {
    const drawn = drawAt(source, maxEdge);
    canvas = drawn.canvas;

    const image = drawn.context.getImageData(0, 0, canvas.width, canvas.height);
    hasTransparency = measureTransparency(image);

    if (options.removeBackground) {
      cutout = hasTransparency
        ? { status: "already-transparent" }
        : removeFlatBackground(image);

      if (cutout.status === "done") {
        drawn.context.putImageData(image, 0, 0);
        hasTransparency = true;
      }
    }

    result = await encode(canvas, hasTransparency);
    if (result.blob.size <= TARGET_BYTES || maxEdge <= MIN_EDGE) break;

    maxEdge = Math.max(MIN_EDGE, Math.round(maxEdge * 0.75));
  }

  if (!result || !canvas) {
    throw new Error("No se pudo preparar la imagen.");
  }

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  return {
    file: new File([result.blob], `${baseName(file.name)}.${result.extension}`, {
      type: result.blob.type,
    }),
    hasTransparency,
    width: canvas.width,
    height: canvas.height,
    cutout,
  };
}
