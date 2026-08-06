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

/**
 * Record a freshly generated background against its slide.
 *
 * @param revalidate
 *   Pass false from the queue. `revalidatePath` refreshes the current route's
 *   payload as soon as the action returns, which mid-run hands BatchDetail a
 *   new `initialPosts` identity — that re-runs the effect holding the blob URLs
 *   and revokes every background currently on screen. Once per slide, that is a
 *   flicker on every completion. The queue revalidates once, at the end.
 */
export async function setSlideBackground(
  slideId: string,
  path: string | null,
  generationParams?: unknown,
  revalidate = true,
): Promise<ActionResult> {
  const supabase = await createClient();

  const patch: {
    background_path: string | null;
    background_status: "ready" | "pending";
    background_error: null;
    generation_params?: never;
  } = {
    background_path: path,
    // The `slides_ready_has_path` constraint makes these two move together;
    // clearing a background has to walk the status back to pending or the
    // update is rejected by the database.
    background_status: path ? "ready" : "pending",
    background_error: null,
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

  if (revalidate) revalidatePath("/contenido");
  return { ok: true };
}

/*
  ---------------------------------------------------------------------------
  Background queue
  ---------------------------------------------------------------------------

  The queue is driven from the browser (see lib/batch/use-background-queue.ts)
  but its state lives in Postgres, so these actions are how the driver reports
  in. Every one of them is scoped by RLS, so a slide from another workspace
  simply matches no rows.

  Deliberately NOT revalidating the path on each transition: a run touches
  these several times per slide, and a revalidate per step would re-fetch the
  whole batch page repeatedly during generation. The driver already holds the
  state it needs; the page re-reads once at the end.
*/

/** How long a slide may sit in `running` before it is assumed abandoned. */
const STALE_RUNNING_MS = 3 * 60 * 1000;

export async function markSlideQueued(slideId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slides")
    .update({ background_status: "queued", background_error: null })
    .eq("id", slideId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Back to the start, with nothing wrong.
 *
 * Used when a run is cancelled mid-request: the slide is not failed and must
 * not carry an error, it simply has not been generated yet.
 */
export async function markSlidePending(slideId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slides")
    .update({
      background_status: "pending",
      background_error: null,
      background_started_at: null,
    })
    .eq("id", slideId)
    // Never walk a finished slide backwards: a cancel that races a completion
    // would otherwise discard a background that was already written.
    .neq("background_status", "ready");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markSlideRunning(slideId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slides")
    .update({
      background_status: "running",
      background_started_at: new Date().toISOString(),
      background_error: null,
    })
    .eq("id", slideId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markSlideFailed(
  slideId: string,
  message: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slides")
    .update({
      background_status: "failed",
      // Truncated: this is shown inline in the UI, and some provider errors
      // arrive as several hundred characters of JSON.
      background_error: message.slice(0, 500),
    })
    .eq("id", slideId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Count an attempt against a slide, so runaway retries stay visible. */
export async function bumpSlideAttempts(
  slideId: string,
  attempts: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slides")
    .update({ background_attempts: attempts })
    .eq("id", slideId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Return slides stuck in a non-terminal state to `pending` before a run starts.
 *
 * A driver that closed its tab mid-request leaves the slide in `running`
 * forever — nothing else in the system will ever move it, because nothing else
 * is running. Since the image route caps at 120s, anything older than three
 * minutes is definitively dead rather than slow.
 *
 * `queued` is reset unconditionally: it only ever means "a previous run
 * claimed this and did not get to it".
 */
export async function resetStaleBackgrounds(
  batchId: string,
): Promise<{ ok: true; reset: number } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id")
    .eq("batch_id", batchId);

  if (postsError) return { ok: false, error: postsError.message };
  const postIds = (posts ?? []).map((post) => post.id);
  if (postIds.length === 0) return { ok: true, reset: 0 };

  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();

  const { data: queued, error: queuedError } = await supabase
    .from("slides")
    .update({ background_status: "pending" })
    .in("post_id", postIds)
    .eq("background_status", "queued")
    .select("id");

  if (queuedError) return { ok: false, error: queuedError.message };

  const { data: stale, error: staleError } = await supabase
    .from("slides")
    .update({
      background_status: "pending",
      background_error: "La generación anterior se interrumpió.",
    })
    .in("post_id", postIds)
    .eq("background_status", "running")
    .lt("background_started_at", cutoff)
    .select("id");

  if (staleError) return { ok: false, error: staleError.message };

  return { ok: true, reset: (queued?.length ?? 0) + (stale?.length ?? 0) };
}

/** Flip the batch's own status, so the list can show a run in progress. */
export async function setBatchStatus(
  batchId: string,
  status: "draft" | "generating" | "ready" | "failed",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_batches")
    .update({ status })
    .eq("id", batchId);

  if (error) return { ok: false, error: error.message };
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
