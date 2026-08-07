"use client";

import { useEffect, useState } from "react";
import { buildEmbeddedFontCss, type BrandFontRow } from "@/lib/render/brand-tokens";
import { toObjectUrl } from "@/lib/export/rasterize";
import { publicAssetUrl } from "@/lib/storage";
import type { BrandProduct } from "@/lib/schemas/product";
import type { BrandTokens } from "@/templates/types";

export type EditorBrand = {
  id: string;
  name: string;
  palette: Record<string, string>;
  typography: {
    display: { family: string; weight: number };
    body: { family: string; weight: number };
  };
  logo_path: string | null;
  fonts: BrandFontRow[];
  /**
   * Products available to composite. Loaded with the brand rather than fetched
   * per template, so switching to a product template does not stall on a query.
   */
  products: BrandProduct[];
};

export type RenderAssets = {
  brandTokens: BrandTokens | null;
  fontCss: string;
  ready: boolean;
  error: string | null;
};

/**
 * Prepare everything a slide needs to render faithfully.
 *
 * Both jobs here exist to protect the export:
 *
 *   - fonts are fetched and inlined as data URIs, so no network call happens
 *     during rasterization;
 *   - the logo is converted to a blob: URL, because an <img> pointing at
 *     Supabase Storage is cross-origin and would taint the canvas, making
 *     toPng() throw.
 *
 * `ready` stays false until both are done. Exporting before then is what
 * produces a PNG in the wrong typeface.
 */
export function useRenderAssets(brand: EditorBrand | null): RenderAssets {
  const [fontCss, setFontCss] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setReady(false);
    setError(null);

    if (!brand) {
      setFontCss("");
      setLogoUrl(null);
      /*
        Ready, not stuck.

        `ready` means "there is nothing left to prepare", and with no brand
        there is nothing. Returning without it left the flag false forever:
        anything gating on it — the export button, the "Cargando tipografías"
        spinner — would wait for a load that was never going to start. The
        template gallery is the caller that can genuinely pass null, when a
        workspace has no brands yet.
      */
      setReady(true);
      return;
    }

    (async () => {
      try {
        const css = await buildEmbeddedFontCss(brand.fonts);
        if (cancelled) return;
        setFontCss(css);

        if (brand.logo_path) {
          const remote = publicAssetUrl(brand.logo_path);
          if (remote) {
            try {
              createdUrl = await toObjectUrl(remote);
              if (cancelled) return;
              setLogoUrl(createdUrl);
            } catch {
              // A missing logo should degrade the slide, not block the export.
              if (!cancelled) setLogoUrl(null);
            }
          }
        } else {
          setLogoUrl(null);
        }

        if (!cancelled) setReady(true);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron preparar las tipografías.",
          );
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [brand]);

  const brandTokens: BrandTokens | null = brand
    ? {
        palette: brand.palette,
        displayFamily: brand.typography.display.family,
        displayWeight: brand.typography.display.weight,
        bodyFamily: brand.typography.body.family,
        bodyWeight: brand.typography.body.weight,
        logoUrl,
      }
    : null;

  return { brandTokens, fontCss, ready, error };
}
