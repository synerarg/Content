import "server-only";

import {
  megapixelsOf,
  readImageSize,
  sniffImageType,
  type GenerateImageParams,
  type GeneratedImage,
  type ImageProvider,
} from "./provider";

/*
  Google Gemini image generation ("Nano Banana").

  Chosen because it is the only no-credit-card free tier that respects vertical
  aspect ratios natively — Cloudflare's FLUX endpoint accepts no dimensions at
  all and returns square, which would mean discarding ~44% of a 9:16 background
  and destroying the composition the prompt asks for.

  Free-tier caveat worth remembering: Google may use free-tier content for
  training, and commercial rights are limited. That is a business decision about
  client work, not a technical one.
*/

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Overridable so a newer model can be tried without a code change. */
const DEFAULT_MODEL = "gemini-2.5-flash-image";

/**
 * Actual response shape, confirmed against a live call:
 *
 *   { status, model, usage: { total_input_tokens, total_output_tokens },
 *     steps: [ { type: "model_output",
 *                content: [ { type: "image", mime_type, data } ] } ] }
 *
 * Note the published summary describes an `output_image.data` field; the API
 * returns `steps[].content[]` instead, so this is written against observed
 * behaviour rather than the docs.
 */
type InteractionResponse = {
  status?: string;
  model?: string;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; mime_type?: string; data?: string }>;
  }>;
  error?: { message?: string; status?: string };
};

function findImagePart(
  payload: InteractionResponse,
): { data: string; mimeType?: string } | null {
  for (const step of payload.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part?.type === "image" && typeof part.data === "string" && part.data) {
        return { data: part.data, mimeType: part.mime_type };
      }
    }
  }
  return null;
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export class GeminiImageProvider implements ImageProvider {
  readonly name = "google";
  readonly model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

  async generate(params: GenerateImageParams): Promise<GeneratedImage> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta GEMINI_API_KEY. Sacala gratis en aistudio.google.com/apikey y agregala a .env.local.",
      );
    }

    const started = Date.now();

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "text", text: params.prompt }],
        response_format: {
          type: "image",
          // JPEG only — the API rejects image/png outright with
          // "Supported values: 'image/jpeg'". Fine for photographic
          // backgrounds, which is all this layer ever produces; the typography
          // on top is rendered by the template, never baked into this file.
          mime_type: "image/jpeg",
          aspect_ratio: params.aspectRatio,
          image_size: "2K",
        },
      }),
    });

    const durationMs = Date.now() - started;
    const raw = await response.text();

    if (!response.ok) {
      throw new Error(describeGeminiError(response.status, raw));
    }

    let payload: InteractionResponse;
    try {
      payload = JSON.parse(raw) as InteractionResponse;
    } catch {
      throw new Error("Gemini devolvió una respuesta que no es JSON válido.");
    }

    const image = findImagePart(payload);
    if (!image) {
      throw new Error(
        payload.error?.message ??
          "Gemini no devolvió ninguna imagen. Puede haber filtrado el prompt.",
      );
    }

    const bytes = decodeBase64(image.data);
    // Trust the bytes over the declared mime type: a JPEG was requested and the
    // response announced image/png. Sniffing the magic number is what keeps the
    // stored file's extension and Content-Type honest.
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      throw new Error("Gemini devolvió datos que no son una imagen reconocible.");
    }

    // Gemini reports no dimensions and snaps to its own resolution set — a 4:5
    // request comes back 896x1152 (7:9), a 9:16 request 768x1344. The template
    // paints these object-fit: cover, so the resulting crop is only 2-3% and
    // invisible; but the log must carry what was actually produced, not what
    // was asked for.
    const actual = readImageSize(bytes, sniffed);

    return {
      bytes,
      contentType: sniffed,
      width: actual?.width ?? params.width,
      height: actual?.height ?? params.height,
      seed: params.seed ?? null,
      provider: this.name,
      model: this.model,
      megapixels: megapixelsOf(
        actual?.width ?? params.width,
        actual?.height ?? params.height,
      ),
      durationMs,
      inputTokens: payload.usage?.total_input_tokens,
      outputTokens: payload.usage?.total_output_tokens,
    };
  }
}

/** Google puts the useful text in `error.message`; the HTTP reason alone is useless. */
function describeGeminiError(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as InteractionResponse;
    const message = parsed.error?.message;
    if (message) {
      if (status === 429) {
        return `Límite de la capa gratuita alcanzado: ${message}`;
      }
      return message;
    }
  } catch {
    // fall through to the raw text
  }
  return `Error de Gemini (HTTP ${status}): ${raw.slice(0, 300)}`;
}
