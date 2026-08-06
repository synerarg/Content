import { publicAssetUrl } from "@/lib/storage";
import type { BrandTokens } from "@/templates/types";

/*
  Brand tokens and font embedding for the render path.

  Two rules this module exists to enforce:

  1. Templates never hardcode a color or a family. They read CSS custom
     properties (--brand-*), which are set from the brand's stored palette.

  2. Fonts are embedded as data URIs BEFORE anything is rasterized.

  On (2): html-to-image serializes the DOM into an SVG <foreignObject>, which
  the browser treats as a separate document. For a webfont to survive that, the
  @font-face rule must be readable AND its src must resolve inside that
  document. Pointing src at a Supabase Storage URL makes both of those depend on
  a cross-origin fetch succeeding at exactly the right moment; when it doesn't,
  there is no error — the PNG just silently comes out in a system font while the
  preview still looks correct.

  Inlining the .woff2 as base64 removes the network from the equation entirely.
  The rule is self-contained, so there is nothing left to fail.
*/

export type BrandFontRow = {
  family: string;
  weight: number;
  style: string;
  storage_path: string;
};

/** Palette record -> CSS custom properties for the slide wrapper. */
export function paletteToCssVars(
  palette: Record<string, string>,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) {
    vars[`--brand-${key}`] = value;
  }
  return vars;
}

/** Read a token with a fallback, so templates can rely on it existing. */
export function token(
  brand: BrandTokens,
  key: string,
  fallback: string,
): string {
  return brand.palette[key] ?? fallback;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) blows the call-stack argument limit
  // on anything more than ~100KB.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const fontCssCache = new Map<string, string>();

function cacheKey(fonts: BrandFontRow[]): string {
  return fonts
    .map((f) => `${f.family}:${f.weight}:${f.style}:${f.storage_path}`)
    .sort()
    .join("|");
}

/**
 * Build self-contained @font-face rules with the .woff2 bytes inlined.
 *
 * Cached per brand font set: the base64 conversion is not free, and the editor
 * re-renders on every keystroke.
 */
export async function buildEmbeddedFontCss(
  fonts: BrandFontRow[],
): Promise<string> {
  if (fonts.length === 0) return "";

  const key = cacheKey(fonts);
  const cached = fontCssCache.get(key);
  if (cached !== undefined) return cached;

  const rules = await Promise.all(
    fonts.map(async (font) => {
      const url = publicAssetUrl(font.storage_path);
      if (!url) return "";

      try {
        const res = await fetch(url);
        if (!res.ok) return "";
        const base64 = toBase64(await res.arrayBuffer());

        // font-display: block — never show a fallback face. A swap during
        // rasterization would bake the wrong typeface into the PNG.
        return [
          "@font-face{",
          `font-family:'${font.family}';`,
          `font-style:${font.style};`,
          `font-weight:${font.weight};`,
          "font-display:block;",
          `src:url(data:font/woff2;base64,${base64}) format('woff2');`,
          "}",
        ].join("");
      } catch {
        return "";
      }
    }),
  );

  const css = rules.filter(Boolean).join("\n");
  fontCssCache.set(key, css);
  return css;
}

/**
 * Wait until the specific faces a template needs are actually usable.
 *
 * `document.fonts.ready` alone is not enough: it resolves once no load is
 * *pending*, which is trivially true for a face nothing has requested yet.
 * Calling load() for each family/weight forces the request first.
 */
export async function ensureFontsLoaded(fonts: BrandFontRow[]): Promise<void> {
  if (typeof document === "undefined") return;

  await Promise.all(
    fonts.map((font) =>
      document.fonts
        .load(`${font.style} ${font.weight} 100px "${font.family}"`)
        .catch(() => undefined),
    ),
  );

  await document.fonts.ready;
}
