"use client";

import { useEffect, useRef, useState } from "react";
import { toObjectUrl } from "@/lib/export/rasterize";
import { publicAssetUrl } from "@/lib/storage";
import type { BrandProduct } from "@/lib/schemas/product";
import type { ProductAsset } from "@/templates/types";

/**
 * Product images, converted to blob URLs so the export can rasterize them.
 *
 * Same constraint as the logo and the backgrounds: an `<img>` pointing at
 * Supabase Storage is cross-origin, drawing it taints the canvas, and `toPng`
 * then throws SecurityError outright rather than producing a worse image. Every
 * remote asset has to become same-origin before it is ever rendered.
 *
 * Two details that are not incidental:
 *
 *   - Products already converted are SKIPPED when the list identity changes.
 *     A server action that revalidates hands every consumer a fresh array, and
 *     an effect that re-converted on each one would revoke the URLs currently
 *     on screen — the exact flicker bug the background queue had, documented in
 *     HANDOFF §7.
 *   - Revocation happens on unmount only, for the same reason.
 *
 * A product that fails to load is dropped rather than thrown: one broken image
 * must not block the export of the six slides that are fine.
 */
export function useProductAssets(products: BrandProduct[]): {
  byId: Record<string, ProductAsset>;
  ready: boolean;
} {
  const urls = useRef(new Map<string, string>());
  const [byId, setById] = useState<Record<string, ProductAsset>>({});
  const [ready, setReady] = useState(products.length === 0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pending = products.filter((product) => !urls.current.has(product.id));

      if (pending.length === 0) {
        if (!cancelled) setReady(true);
        return;
      }

      if (!cancelled) setReady(false);

      for (const product of pending) {
        const remote = publicAssetUrl(product.imagePath);
        if (!remote) continue;

        try {
          const blobUrl = await toObjectUrl(remote);
          if (cancelled) {
            URL.revokeObjectURL(blobUrl);
            return;
          }
          urls.current.set(product.id, blobUrl);
          setById((current) => ({
            ...current,
            [product.id]: {
              name: product.name,
              url: blobUrl,
              hasTransparency: product.hasTransparency,
            },
          }));
        } catch {
          // Nothing to recover: the slide renders its placeholder instead.
        }
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [products]);

  useEffect(() => {
    const map = urls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  return { byId, ready };
}
