"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  brandFormSchema,
  paletteToRecord,
  type BrandFormValues,
} from "@/lib/schemas/brand";
import { syncGoogleFontsForBrand } from "@/lib/fonts/ingest";
import { splitPastedCaptions } from "@/lib/history";

export type ActionResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

/** Shape shared by insert and update. */
function toRow(values: BrandFormValues, workspaceId: string) {
  return {
    workspace_id: workspaceId,
    name: values.name,
    tagline: values.tagline || null,
    logo_path: values.logo_path,
    palette: paletteToRecord(values.palette),
    typography: values.typography,
    tone_of_voice: values.tone_of_voice || null,
    target_audience: values.target_audience || null,
    example_captions: values.example_captions,
    art_direction: values.art_direction,
  };
}

/** Postgres 23505 = unique_violation; ours can only be the per-workspace name index. */
function describeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe una marca con ese nombre en este espacio de trabajo.";
  }
  return error.message;
}

export async function createBrand(input: unknown): Promise<ActionResult> {
  const parsed = brandFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("brands")
      .insert(toRow(parsed.data, workspaceId))
      .select("id")
      .single();

    if (error) return { ok: false, error: describeError(error) };

    const fonts = await syncGoogleFontsForBrand({
      workspaceId,
      brandId: data.id,
      typography: parsed.data.typography,
    });

    revalidatePath("/marcas");
    return {
      ok: true,
      id: data.id,
      warning: fonts.errors.length ? fonts.errors.join(" ") : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

export async function updateBrand(
  brandId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = brandFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    // No .eq("workspace_id", ...) needed — RLS restricts the update to rows in
    // the caller's workspace, and a mismatched id simply matches zero rows.
    const { data, error } = await supabase
      .from("brands")
      .update(toRow(parsed.data, workspaceId))
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: describeError(error) };
    if (!data) return { ok: false, error: "No se encontró la marca." };

    const fonts = await syncGoogleFontsForBrand({
      workspaceId,
      brandId,
      typography: parsed.data.typography,
    });

    revalidatePath("/marcas");
    revalidatePath(`/marcas/${brandId}`);
    return {
      ok: true,
      id: brandId,
      warning: fonts.errors.length ? fonts.errors.join(" ") : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

export async function deleteBrand(brandId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("brands")
      .delete()
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "No se encontró la marca." };

    revalidatePath("/marcas");
    return { ok: true, id: brandId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

/*
  ---------------------------------------------------------------------------
  Published history
  ---------------------------------------------------------------------------

  What the brand has already put out, so the generator can be told not to
  repeat it. Imported by hand today; the same rows are what an Instagram or
  Meta Ads sync would write, which is why `source` and `external_id` exist
  before anything populates them.
*/

export type ImportResult =
  | { ok: true; imported: number; duplicates: number }
  | { ok: false; error: string };

export async function importPublishedPosts(
  brandId: string,
  raw: string,
): Promise<ImportResult> {
  const captions = splitPastedCaptions(raw);
  if (captions.length === 0) {
    return { ok: false, error: "No se detectó ningún caption." };
  }

  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    /*
      Inserted one at a time, on purpose.

      The unique index on (brand_id, md5(caption)) is what stops the same block
      being pasted twice — but in a single multi-row insert, one duplicate
      fails the whole statement and nothing lands. Pasting 30 captions of which
      2 are already stored is the normal case, not an error, so each row gets
      its own statement and the duplicates are counted rather than raised.
    */
    let imported = 0;
    let duplicates = 0;

    for (const caption of captions) {
      const { error } = await supabase.from("brand_published_posts").insert({
        workspace_id: workspaceId,
        brand_id: brandId,
        source: "manual",
        caption,
      });

      if (!error) {
        imported++;
        continue;
      }
      if (error.code === "23505") {
        duplicates++;
        continue;
      }
      return { ok: false, error: error.message };
    }

    revalidatePath(`/marcas/${brandId}/historial`);
    return { ok: true, imported, duplicates };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

export async function deletePublishedPost(
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_published_posts")
    .delete()
    .eq("id", postId)
    .select("brand_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró el post." };

  revalidatePath(`/marcas/${data.brand_id}/historial`);
  return { ok: true };
}
