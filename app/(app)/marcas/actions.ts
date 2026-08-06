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
