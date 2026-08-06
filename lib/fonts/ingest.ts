import "server-only";

import { createClient } from "@/lib/supabase/server";

/*
  Google Fonts ingestion.

  Brand fonts are ALWAYS self-hosted in Supabase Storage, never <link>ed to
  fonts.googleapis.com. This is not a performance choice — it is the precondition
  for export fidelity in Phase 2.

  html-to-image serializes the DOM into an SVG <foreignObject>, which the browser
  treats as a separate document. To embed a font into that document, the library
  must READ the @font-face CSS rule. A stylesheet served cross-origin from Google
  cannot be read (the CSSOM throws on cross-origin rules), so the embed silently
  produces no font and the exported PNG falls back to a system typeface while the
  preview still looks correct.

  Downloading the .woff2 once, into our own bucket, makes Google-picked fonts and
  hand-uploaded fonts structurally identical from here on.
*/

const BUCKET = "brand-assets";

// Google serves .woff2 only to user agents it believes support it. With Node's
// default UA it returns .ttf, which is ~3x larger and defeats the point.
const WOFF2_CAPABLE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Basic Latin. Google splits a family into several @font-face blocks by subset;
// this is the one Rioplatense Spanish copy actually needs.
const LATIN_RANGE_MARKER = "U+0000-00FF";

export type FontRole = {
  family: string;
  weight: number;
  source: "google" | "upload";
};

export type FontSyncResult = {
  synced: number;
  skipped: number;
  errors: string[];
};

type FaceBlock = { url: string; unicodeRange: string };

function parseFontFaces(css: string): FaceBlock[] {
  const blocks: FaceBlock[] = [];
  const faceRe = /@font-face\s*\{([^}]*)\}/g;

  for (const match of css.matchAll(faceRe)) {
    const body = match[1];
    const url = body.match(/src:[^;]*url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;
    blocks.push({
      url,
      unicodeRange: body.match(/unicode-range:\s*([^;]+)/)?.[1] ?? "",
    });
  }

  return blocks;
}

async function resolveWoff2Url(
  family: string,
  weight: number,
): Promise<string | null> {
  const url = new URL("https://fonts.googleapis.com/css2");
  url.searchParams.set("family", `${family}:wght@${weight}`);
  url.searchParams.set("display", "swap");

  const res = await fetch(url, { headers: { "User-Agent": WOFF2_CAPABLE_UA } });
  if (!res.ok) return null;

  const faces = parseFontFaces(await res.text());
  if (faces.length === 0) return null;

  const latin = faces.find((face) =>
    face.unicodeRange.includes(LATIN_RANGE_MARKER),
  );
  return (latin ?? faces[faces.length - 1]).url;
}

function storagePath(
  workspaceId: string,
  brandId: string,
  family: string,
  weight: number,
  style: string,
) {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${workspaceId}/${brandId}/fonts/${slug}-${weight}-${style}.woff2`;
}

/**
 * Ensure every Google-sourced role in a brand's typography has a stored .woff2
 * and a matching brand_fonts row.
 *
 * Never throws: a font that fails to download must not block saving the brand.
 * Failures come back in `errors` so the caller can surface them, because a
 * silently missing font becomes a wrong-typeface export two phases later.
 */
export async function syncGoogleFontsForBrand({
  workspaceId,
  brandId,
  typography,
}: {
  workspaceId: string;
  brandId: string;
  typography: Record<string, FontRole>;
}): Promise<FontSyncResult> {
  const result: FontSyncResult = { synced: 0, skipped: 0, errors: [] };

  // display and body frequently share a family+weight; store it once.
  const wanted = new Map<string, FontRole>();
  for (const role of Object.values(typography)) {
    if (role.source !== "google") continue;
    wanted.set(`${role.family}::${role.weight}::normal`, role);
  }
  if (wanted.size === 0) return result;

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("brand_fonts")
    .select("family, weight, style")
    .eq("brand_id", brandId);

  if (existingError) {
    result.errors.push(`No se pudieron leer las tipografías: ${existingError.message}`);
    return result;
  }

  const have = new Set(
    (existing ?? []).map((row) => `${row.family}::${row.weight}::${row.style}`),
  );

  for (const [key, role] of wanted) {
    if (have.has(key)) {
      result.skipped++;
      continue;
    }

    try {
      const woff2Url = await resolveWoff2Url(role.family, role.weight);
      if (!woff2Url) {
        result.errors.push(
          `No se encontró "${role.family}" ${role.weight} en Google Fonts.`,
        );
        continue;
      }

      const fontRes = await fetch(woff2Url, {
        headers: { "User-Agent": WOFF2_CAPABLE_UA },
      });
      if (!fontRes.ok) {
        result.errors.push(`Falló la descarga de "${role.family}" ${role.weight}.`);
        continue;
      }

      const bytes = new Uint8Array(await fontRes.arrayBuffer());
      const path = storagePath(workspaceId, brandId, role.family, role.weight, "normal");

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: "font/woff2",
          upsert: true,
          cacheControl: "31536000",
        });

      if (uploadError) {
        result.errors.push(
          `No se pudo guardar "${role.family}" ${role.weight}: ${uploadError.message}`,
        );
        continue;
      }

      const { error: insertError } = await supabase.from("brand_fonts").insert({
        workspace_id: workspaceId,
        brand_id: brandId,
        family: role.family,
        weight: role.weight,
        style: "normal",
        storage_path: path,
        source: "google",
      });

      if (insertError) {
        result.errors.push(
          `No se pudo registrar "${role.family}" ${role.weight}: ${insertError.message}`,
        );
        continue;
      }

      result.synced++;
    } catch (error) {
      result.errors.push(
        `Error con "${role.family}" ${role.weight}: ${
          error instanceof Error ? error.message : "desconocido"
        }`,
      );
    }
  }

  return result;
}
