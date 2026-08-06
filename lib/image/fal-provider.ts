import "server-only";

import { fal } from "@fal-ai/client";
import {
  DEFAULT_RETRY_AFTER_MS,
  megapixelsOf,
  RateLimitError,
  sniffImageType,
  type GenerateImageParams,
  type GeneratedImage,
  type ImageProvider,
} from "./provider";

/** FLUX.2 [dev] on fal. Roughly US$0.012 per megapixel at time of writing. */
const FAL_ENDPOINT = "fal-ai/flux-2";

type FalImage = { url: string; width?: number; height?: number };
type FalOutput = { images?: FalImage[]; seed?: number };

/**
 * Turn a fal error into something a user can act on.
 *
 * fal sets `message` to the bare HTTP reason ("Forbidden") and puts the real
 * explanation in `body.detail` — an exhausted balance arrives as
 * `message: "Forbidden"` with `body.detail: "User is locked. Reason: Exhausted
 * balance..."`. Surfacing only `message` tells the user nothing about what to fix.
 */
function describeFalError(cause: unknown): string {
  const err = cause as {
    message?: string;
    status?: number;
    body?: { detail?: unknown };
  };

  const detail = err?.body?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    if (first?.msg) {
      const where = Array.isArray(first.loc) ? ` (${first.loc.join(".")})` : "";
      return `fal rechazó la solicitud: ${first.msg}${where}`;
    }
  }

  const status = err?.status ? ` (HTTP ${err.status})` : "";
  return `Error de fal${status}: ${err?.message ?? "desconocido"}`;
}

export class FalFluxProvider implements ImageProvider {
  readonly name = "fal";
  readonly model = FAL_ENDPOINT;

  async generate(params: GenerateImageParams): Promise<GeneratedImage> {
    const credentials = process.env.FAL_KEY;
    if (!credentials) {
      throw new Error(
        "Falta FAL_KEY. Agregala a .env.local para generar imágenes con fal.",
      );
    }

    fal.config({ credentials });
    const started = Date.now();

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(FAL_ENDPOINT, {
        input: {
          prompt: params.prompt,
          // Explicit dimensions rather than a named preset, so the aspect ratio
          // matches the output format exactly.
          image_size: { width: params.width, height: params.height },
          num_images: 1,
          output_format: "png",
          ...(params.seed !== null && params.seed !== undefined
            ? { seed: params.seed }
            : {}),
        },
      });
    } catch (cause) {
      // Same distinction Gemini gets: a 429 is a wait, so the queue can pace
      // itself instead of marking the slide failed. fal sends no retry hint.
      if ((cause as { status?: number })?.status === 429) {
        throw new RateLimitError(describeFalError(cause), DEFAULT_RETRY_AFTER_MS);
      }
      throw new Error(describeFalError(cause));
    }

    const data = result.data as FalOutput;
    const image = data.images?.[0];
    if (!image?.url) {
      throw new Error("El proveedor no devolvió ninguna imagen.");
    }

    // fal's CDN link is ephemeral, so the bytes are pulled here rather than
    // handed upward as a URL — that keeps the provider contract identical to
    // Gemini's, which returns inline base64.
    const download = await fetch(image.url);
    if (!download.ok) {
      throw new Error(
        `No se pudo descargar la imagen generada (HTTP ${download.status}).`,
      );
    }
    const bytes = new Uint8Array(await download.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      throw new Error("fal devolvió datos que no son una imagen reconocible.");
    }

    const width = image.width ?? params.width;
    const height = image.height ?? params.height;

    return {
      bytes,
      contentType: sniffed,
      width,
      height,
      seed: data.seed ?? params.seed ?? null,
      provider: this.name,
      model: this.model,
      megapixels: megapixelsOf(width, height),
      durationMs: Date.now() - started,
    };
  }
}
