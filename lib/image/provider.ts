import type { FormatKey } from "@/templates/types";

/**
 * The image-generation seam.
 *
 * Product code depends only on this interface, never on a vendor SDK, so
 * switching providers is a matter of writing one implementation and changing
 * the factory.
 *
 * Providers return BYTES, not a URL. fal hands back a CDN link while Gemini
 * returns inline base64 — normalising that difference inside each provider
 * keeps the caller identical for both, and the caller has to hold the bytes
 * anyway to copy them into Storage.
 */

export type GenerateImageParams = {
  prompt: string;
  /** Exact dimensions, for providers that accept them (fal). */
  width: number;
  height: number;
  /** Ratio string, for providers that only accept a ratio (Gemini). */
  aspectRatio: string;
  /** Reused across a carousel's slides to hold the visual style steady. */
  seed?: number | null;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  seed: number | null;
  provider: string;
  model: string;
  /** Billing unit for per-megapixel providers; 0 when billing is per image. */
  megapixels: number;
  durationMs: number;
  /** Reported by token-billed providers (Gemini); absent for per-pixel ones. */
  inputTokens?: number;
  outputTokens?: number;
};

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generate(params: GenerateImageParams): Promise<GeneratedImage>;
}

/**
 * A provider refused because of a rate limit, not because anything is wrong.
 *
 * This has to be distinguishable from every other failure, because the correct
 * response is the opposite one: a bad prompt should stop and be reported, a
 * rate limit should wait and try again. Before the queue existed both surfaced
 * as HTTP 500 and a red toast — which is why clicking "Generar fondo" twice
 * quickly used to just fail the second one.
 *
 * `retryAfterMs` is whatever the provider said to wait, when it says so.
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Fallback wait when a 429 carries no retry hint.
 *
 * 31s rather than 30: the Gemini free tier's documented ceiling is per MINUTE
 * at 2 images, so a wait of exactly half a minute lands right on the boundary
 * and races it. One second past is the difference between a retry that works
 * and one that 429s again.
 */
export const DEFAULT_RETRY_AFTER_MS = 31_000;

/**
 * Pull a retry delay out of a provider error payload.
 *
 * Google returns it as `error.details[]` containing a RetryInfo entry with a
 * protobuf duration string (`"31s"`, `"1.5s"`). The shape is searched for
 * loosely rather than parsed strictly — this is a hint used to pace a retry, so
 * a miss costs one extra wait, while being too strict about an undocumented
 * shape costs the hint entirely.
 */
export function parseRetryAfterMs(raw: string): number | null {
  const match = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return null;
}

/**
 * Generation targets per output format.
 *
 * Dimensions are divisible by 16 (diffusion models prefer it) and hit the
 * target ratio exactly:
 *   feed  1088x1360 -> 0.800  = 4:5
 *   story 1152x2048 -> 0.5625 = 9:16
 *
 * `aspectRatio` carries the same intent for providers that expose a ratio
 * rather than pixel dimensions. Both are supplied so neither kind of provider
 * has to infer anything.
 */
export const GENERATION_SIZE: Record<
  FormatKey,
  { width: number; height: number; aspectRatio: string }
> = {
  feed: { width: 1088, height: 1360, aspectRatio: "4:5" },
  story: { width: 1152, height: 2048, aspectRatio: "9:16" },
};

export function megapixelsOf(width: number, height: number): number {
  return Number(((width * height) / 1_000_000).toFixed(4));
}

/**
 * Read a decoded image's real dimensions from its header.
 *
 * Providers do not reliably report these: Gemini returns none at all and snaps
 * to its own resolution set, so recording the *requested* size would put a
 * fiction into the generations log.
 */
export function readImageSize(
  bytes: Uint8Array,
  contentType: string,
): { width: number; height: number } | null {
  if (contentType === "image/png") {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (contentType === "image/jpeg") {
    // Walk the segment chain to a start-of-frame marker, which carries the size.
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8],
        };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }

  return null;
}

/** PNG and JPEG magic numbers, for validating what a provider actually sent. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
