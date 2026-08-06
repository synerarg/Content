"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const slotsSchema = z.record(z.string(), z.string());

/** Persist edited slot text for one slide. */
export async function updateSlideSlots(
  slideId: string,
  slots: unknown,
): Promise<ActionResult> {
  const parsed = slotsSchema.safeParse(slots);
  if (!parsed.success) return { ok: false, error: "Slots inválidos." };

  const supabase = await createClient();
  // RLS restricts this to the caller's workspace; a foreign id matches no rows.
  const { data, error } = await supabase
    .from("slides")
    .update({ slots: parsed.data as never })
    .eq("id", slideId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la placa." };

  revalidatePath("/contenido");
  return { ok: true };
}

const postPatchSchema = z.object({
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  cta: z.string().max(120).optional(),
});

export async function updatePost(
  postId: string,
  patch: unknown,
): Promise<ActionResult> {
  const parsed = postPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update(parsed.data)
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la pieza." };

  revalidatePath("/contenido");
  return { ok: true };
}

/** Record a freshly generated background against its slide. */
export async function setSlideBackground(
  slideId: string,
  path: string | null,
  generationParams?: unknown,
): Promise<ActionResult> {
  const supabase = await createClient();

  const patch: { background_path: string | null; generation_params?: never } = {
    background_path: path,
  };
  if (generationParams !== undefined) {
    patch.generation_params = generationParams as never;
  }

  const { data, error } = await supabase
    .from("slides")
    .update(patch)
    .eq("id", slideId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la placa." };

  revalidatePath("/contenido");
  return { ok: true };
}

export async function deleteBatch(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // posts and slides cascade from the batch.
  const { data, error } = await supabase
    .from("content_batches")
    .delete()
    .eq("id", batchId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró el lote." };

  revalidatePath("/contenido");
  return { ok: true };
}
