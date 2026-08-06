import "server-only";

import { FalFluxProvider } from "./fal-provider";
import { GeminiImageProvider } from "./gemini-provider";
import type { ImageProvider } from "./provider";

/**
 * The single place a concrete image provider is chosen.
 *
 * Everything upstream takes an ImageProvider, so switching vendors means adding
 * an implementation and editing this function — no product code changes. This
 * is exactly the swap the seam was built for: fal was the plan of record until
 * its billing became a blocker, and moving to Gemini touched only this file and
 * one new provider.
 *
 * Override with IMAGE_PROVIDER=fal|google in .env.local. When unset, whichever
 * provider actually has a key configured wins, so adding FAL_KEY later is
 * enough to switch back.
 */
export function getImageProvider(): ImageProvider {
  const requested = process.env.IMAGE_PROVIDER?.trim().toLowerCase();

  if (requested === "fal") return new FalFluxProvider();
  if (requested === "google" || requested === "gemini") {
    return new GeminiImageProvider();
  }

  if (process.env.GEMINI_API_KEY) return new GeminiImageProvider();
  if (process.env.FAL_KEY) return new FalFluxProvider();

  // Nothing configured: return Gemini so the error names the key to add.
  return new GeminiImageProvider();
}
