"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { distributeSchedule } from "@/lib/schedule";

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

/**
 * Point one slide at a different product.
 *
 * Deliberately does NOT revalidate. This is called from the batch page while
 * every background on screen is held as a blob URL keyed by slide id; a
 * revalidate hands `BatchDetail` a fresh `initialPosts` identity, which re-runs
 * the effect that owns those URLs. Same trap as the queue's per-slide writes,
 * documented in HANDOFF §7. The browser already has the new value — it is what
 * sent it — so there is nothing to re-fetch.
 */
export async function setSlideProduct(
  slideId: string,
  productId: string | null,
): Promise<ActionResult> {
  if (productId !== null && !z.uuid().safeParse(productId).success) {
    return { ok: false, error: "Producto inválido." };
  }

  const supabase = await createClient();
  /*
    RLS covers the slide. It does NOT check that the product belongs to the
    same brand — slides do not carry brand_id (see migration 0013) — so the
    guarantee here is workspace isolation, not brand isolation: the worst a
    hand-crafted request achieves is putting one of YOUR OWN products on one of
    YOUR OWN slides.
  */
  const { data, error } = await supabase
    .from("slides")
    .update({ product_id: productId })
    .eq("id", slideId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la placa." };

  return { ok: true };
}

/*
  ---------------------------------------------------------------------------
  Persisted renders
  ---------------------------------------------------------------------------

  The composed PNG is written by the BROWSER, straight to Storage through a
  signed URL, exactly like a logo or a product photo — Vercel caps request
  bodies at 4.5 MB and a 1080x1920 story is comfortably over half of that
  before anything else is in the envelope. These two actions handle only the
  small JSON that has to cross a function boundary: recording where the bytes
  landed, and minting a URL to read them back.
*/

const renderSchema = z.object({
  path: z.string().min(1).max(400),
  fingerprint: z.string().min(1).max(64),
});

/**
 * Record the render a slide now has.
 *
 * Does NOT revalidate, for the same reason `setSlideProduct` does not: the
 * batch page holds every background as a blob URL keyed by slide id, and a
 * revalidate hands it a fresh `initialPosts` identity which re-runs the effect
 * that owns those URLs. HANDOFF §7.
 */
export async function setSlideRender(
  slideId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = renderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos del render inválidos." };

  /*
    The path is checked against the caller's OWN workspace prefix before it is
    stored. Storage policies already stop a member of another workspace writing
    there, so this is not the boundary — it stops a member of THIS workspace
    from recording a path that points at someone else's object, which the
    policies have no opinion about and which would later be read back through a
    signed URL minted by us.
  */
  const workspaceId = await requireWorkspaceId();
  if (!parsed.data.path.startsWith(`${workspaceId}/`)) {
    return { ok: false, error: "Ruta de render fuera del espacio de trabajo." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slides")
    .update({
      render_path: parsed.data.path,
      render_fingerprint: parsed.data.fingerprint,
      rendered_at: new Date().toISOString(),
    })
    .eq("id", slideId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la placa." };

  return { ok: true };
}

/** How long a render URL stays fetchable. */
const RENDER_URL_TTL_SECONDS = 60 * 60;

export type RenderUrlResult =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; error: string };

/**
 * A URL for a slide's stored render, readable without a session.
 *
 * One hour. Long enough for a person to open it, short enough that a link
 * pasted somewhere it should not be stops working the same afternoon — these
 * are unpublished pieces for a client.
 *
 * The path is read from the row rather than accepted as an argument: taking one
 * would turn this into a signing oracle for any object in the bucket, and RLS
 * on `slides` is what makes reading the row equivalent to being allowed the
 * file.
 */
export async function getSlideRenderUrl(
  slideId: string,
): Promise<RenderUrlResult> {
  const supabase = await createClient();

  const { data: slide, error } = await supabase
    .from("slides")
    .select("render_path")
    .eq("id", slideId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!slide) return { ok: false, error: "No se encontró la placa." };
  if (!slide.render_path) {
    return { ok: false, error: "Esa placa todavía no tiene un PNG guardado." };
  }

  const { data, error: signError } = await supabase.storage
    .from("renders")
    .createSignedUrl(slide.render_path, RENDER_URL_TTL_SECONDS);

  if (signError) return { ok: false, error: signError.message };
  if (!data?.signedUrl) return { ok: false, error: "No se pudo firmar la URL." };

  return {
    ok: true,
    url: data.signedUrl,
    expiresInSeconds: RENDER_URL_TTL_SECONDS,
  };
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

/**
 * Soft-delete: flag it, do not remove it.
 *
 * A batch is an afternoon of copy plus several minutes of paid image
 * generation, sitting behind one confirm click. Flagging costs nothing and
 * makes the Deshacer in the toast possible; a real DELETE would cascade posts,
 * slides and background history past any hope of recovery.
 *
 * Nothing purges these yet. That is deliberate — an automatic purge needs a
 * scheduled job this deployment does not have, and until then a hidden row is
 * far cheaper than a lost one.
 */
export async function deleteBatch(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_batches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", batchId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró el lote." };

  revalidatePath("/contenido");
  return { ok: true };
}

export async function restoreBatch(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_batches")
    .update({ deleted_at: null })
    .eq("id", batchId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se pudo restaurar el lote." };

  revalidatePath("/contenido");
  return { ok: true };
}

/*
  ---------------------------------------------------------------------------
  Background history
  ---------------------------------------------------------------------------
*/

/** How many attempts stay browsable per slide. */
const HISTORY_LIMIT = 5;

export type SlideBackground = {
  id: string;
  storagePath: string;
  signedUrl: string | null;
  prompt: string | null;
  seed: number | null;
  createdAt: string;
};

/**
 * Record a generated background against its slide, keeping the last five.
 *
 * Pruning deletes the ROW, never the Storage object: an orphaned file costs a
 * fraction of a cent, and deleting one that is still referenced costs a
 * regeneration. Reaping storage is a separate job with different stakes.
 */
export async function recordSlideBackground(entry: {
  slideId: string;
  storagePath: string;
  prompt?: string | null;
  seed?: number | null;
  provider?: string | null;
  model?: string | null;
}): Promise<ActionResult> {
  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    const { error } = await supabase.from("slide_backgrounds").upsert(
      {
        workspace_id: workspaceId,
        slide_id: entry.slideId,
        storage_path: entry.storagePath,
        prompt: entry.prompt ?? null,
        seed: entry.seed ?? null,
        provider: entry.provider ?? null,
        model: entry.model ?? null,
      },
      { onConflict: "slide_id,storage_path", ignoreDuplicates: true },
    );

    if (error) return { ok: false, error: error.message };

    const { data: rows } = await supabase
      .from("slide_backgrounds")
      .select("id")
      .eq("slide_id", entry.slideId)
      .order("created_at", { ascending: false });

    const stale = (rows ?? []).slice(HISTORY_LIMIT).map((row) => row.id);
    if (stale.length > 0) {
      await supabase.from("slide_backgrounds").delete().in("id", stale);
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

const SIGNED_URL_TTL = 60 * 60;

/** Previous backgrounds for a slide, newest first, with fresh signed URLs. */
export async function listSlideBackgrounds(
  slideId: string,
): Promise<{ ok: true; items: SlideBackground[] } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("slide_backgrounds")
    .select("id, storage_path, prompt, seed, created_at")
    .eq("slide_id", slideId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) return { ok: false, error: error.message };

  const paths = (data ?? []).map((row) => row.storage_path);
  const signedByPath = new Map<string, string>();

  if (paths.length > 0) {
    // One call for the set rather than one per item — the gallery opens on a
    // click and a round trip per thumbnail would be visible.
    const { data: signed } = await supabase.storage
      .from("generated")
      .createSignedUrls(paths, SIGNED_URL_TTL);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }

  return {
    ok: true,
    items: (data ?? []).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      signedUrl: signedByPath.get(row.storage_path) ?? null,
      prompt: row.prompt,
      seed: row.seed,
      createdAt: row.created_at,
    })),
  };
}

/*
  ---------------------------------------------------------------------------
  Duplication
  ---------------------------------------------------------------------------

  Copies EVERYTHING — template, slots, format, background reference and the
  scene brief — because a duplicate that drops the background is not a starting
  point, it is a chore. The copy points at the same Storage object rather than
  re-generating: the image already exists and is already paid for.

  What a duplicate deliberately does NOT inherit is the SCHEDULE. Copying the
  dates would double-book every day the original occupies, and the reason to
  duplicate a batch is almost always to run it again later. It arrives
  unscheduled, which is also what the calendar's "sin programar" list is for.
*/

export async function duplicateBatch(
  batchId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    const { data: source, error: sourceError } = await supabase
      .from("content_batches")
      .select(
        `id, title, brief, brand_id,
         posts (id, position, type, caption, hashtags, cta,
                slides (position, template_slug, format, slots, product_id, background_path,
                        background_status, generation_params))`,
      )
      .eq("id", batchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (sourceError) return { ok: false, error: sourceError.message };
    if (!source) return { ok: false, error: "No se encontró el lote." };

    const { data: batch, error: batchError } = await supabase
      .from("content_batches")
      .insert({
        workspace_id: workspaceId,
        brand_id: source.brand_id,
        title: `${source.title} (copia)`,
        brief: source.brief,
        status: "ready",
      })
      .select("id")
      .single();

    if (batchError) return { ok: false, error: batchError.message };

    const sourcePosts = (source.posts ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);

    if (sourcePosts.length > 0) {
      const { data: newPosts, error: postsError } = await supabase
        .from("posts")
        .insert(
          sourcePosts.map((post) => ({
            workspace_id: workspaceId,
            batch_id: batch.id,
            position: post.position,
            type: post.type,
            caption: post.caption,
            hashtags: post.hashtags,
            cta: post.cta,
          })),
        )
        .select("id, position");

      if (postsError) return { ok: false, error: postsError.message };

      const idByPosition = new Map(
        (newPosts ?? []).map((row) => [row.position, row.id]),
      );

      const slideRows = sourcePosts.flatMap((post) => {
        const newPostId = idByPosition.get(post.position);
        if (!newPostId) return [];

        return (post.slides ?? []).map((slide) => ({
          workspace_id: workspaceId,
          post_id: newPostId,
          position: slide.position,
          template_slug: slide.template_slug,
          format: slide.format,
          slots: slide.slots as never,
          product_id: slide.product_id,
          background_path: slide.background_path,
          // Kept in step with the path: the `slides_ready_has_path` constraint
          // rejects a 'ready' row with no background, and a copied slide that
          // has one is genuinely ready.
          background_status: slide.background_path
            ? ("ready" as const)
            : ("pending" as const),
          generation_params: slide.generation_params as never,
        }));
      });

      if (slideRows.length > 0) {
        const { error: slidesError } = await supabase
          .from("slides")
          .insert(slideRows);
        if (slidesError) return { ok: false, error: slidesError.message };
      }
    }

    revalidatePath("/contenido");
    return { ok: true, id: batch.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

/** Duplicate one piece inside its own batch, appended at the end. */
export async function duplicatePost(
  postId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    const { data: source, error: sourceError } = await supabase
      .from("posts")
      .select(
        `id, batch_id, type, caption, hashtags, cta,
         slides (position, template_slug, format, slots, product_id, background_path,
                 background_status, generation_params)`,
      )
      .eq("id", postId)
      .maybeSingle();

    if (sourceError) return { ok: false, error: sourceError.message };
    if (!source) return { ok: false, error: "No se encontró la pieza." };

    // Appended rather than inserted beside the original: `posts` has no unique
    // constraint on position, but shifting every sibling to make room is a lot
    // of writes to put a copy one row higher.
    const { data: siblings } = await supabase
      .from("posts")
      .select("position")
      .eq("batch_id", source.batch_id)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition = (siblings?.[0]?.position ?? -1) + 1;

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        workspace_id: workspaceId,
        batch_id: source.batch_id,
        position: nextPosition,
        type: source.type,
        caption: source.caption,
        hashtags: source.hashtags,
        cta: source.cta,
      })
      .select("id")
      .single();

    if (postError) return { ok: false, error: postError.message };

    const slideRows = (source.slides ?? []).map((slide) => ({
      workspace_id: workspaceId,
      post_id: post.id,
      position: slide.position,
      template_slug: slide.template_slug,
      format: slide.format,
      slots: slide.slots as never,
      product_id: slide.product_id,
      background_path: slide.background_path,
      background_status: slide.background_path
        ? ("ready" as const)
        : ("pending" as const),
      generation_params: slide.generation_params as never,
    }));

    if (slideRows.length > 0) {
      const { error: slidesError } = await supabase.from("slides").insert(slideRows);
      if (slidesError) return { ok: false, error: slidesError.message };
    }

    revalidatePath(`/contenido/${source.batch_id}`);
    return { ok: true, id: post.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error inesperado.",
    };
  }
}

/*
  ---------------------------------------------------------------------------
  Scheduling
  ---------------------------------------------------------------------------

  A day and a wall-clock time per piece, never an instant — see migration 0014
  for why that distinction is the whole design.

  None of these revalidate. They are called from the batch page, which holds
  every background on screen as a blob URL keyed by slide id, and from the
  calendar, which knows exactly what it changed. Each caller refreshes if it
  needs to; see the note on setSlideProduct.
*/

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida.");

const postScheduleSchema = z.object({
  scheduled_on: daySchema.nullable(),
  scheduled_time: timeSchema.nullable(),
});

export async function setPostSchedule(
  postId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = postScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  // Mirrors the database's own check constraint. Clearing the day has to clear
  // the hour with it, or the update is rejected by Postgres with a message
  // nobody reading a calendar would understand.
  const patch = parsed.data.scheduled_on
    ? parsed.data
    : { scheduled_on: null, scheduled_time: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró la pieza." };

  return { ok: true };
}

const batchScheduleSchema = z.object({
  startOn: daySchema,
  everyDays: z.number().int().min(1).max(31),
  skipWeekends: z.boolean(),
  time: timeSchema,
});

export type BatchScheduleResult =
  | { ok: true; assigned: Array<{ postId: string; scheduledOn: string }> }
  | { ok: false; error: string };

/**
 * Spread a whole batch across the calendar in one go.
 *
 * This is the reason the feature is worth building rather than a date field on
 * each piece: a week of content is five pieces, and setting five dates by hand
 * is exactly the click count Phase 7 existed to remove.
 *
 * Returns the assignment so the caller can patch its own state instead of
 * refreshing — the batch page is holding blob URLs it would rather not disturb.
 */
export async function scheduleBatch(
  batchId: string,
  input: unknown,
): Promise<BatchScheduleResult> {
  const parsed = batchScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();

  // Ordered by position: the publishing order is the order the generator wrote
  // them in, which is the order the recipe asked for.
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, position")
    .eq("batch_id", batchId)
    .order("position", { ascending: true });

  if (postsError) return { ok: false, error: postsError.message };
  if (!posts || posts.length === 0) {
    return { ok: false, error: "Este lote no tiene piezas." };
  }

  const days = distributeSchedule(posts.length, {
    startOn: parsed.data.startOn,
    everyDays: parsed.data.everyDays,
    skipWeekends: parsed.data.skipWeekends,
  });

  /*
    One statement per piece rather than an upsert of the whole set.

    An upsert would need every not-null column of `posts` in the payload — the
    caption included — so a stale client would overwrite copy that was edited
    since the page loaded. Five updates is not a performance problem; silently
    reverting someone's caption is.
  */
  const assigned: Array<{ postId: string; scheduledOn: string }> = [];
  for (const [index, post] of posts.entries()) {
    const scheduledOn = days[index];
    if (!scheduledOn) continue;

    const { error } = await supabase
      .from("posts")
      .update({ scheduled_on: scheduledOn, scheduled_time: parsed.data.time })
      .eq("id", post.id);

    if (error) return { ok: false, error: error.message };
    assigned.push({ postId: post.id, scheduledOn });
  }

  return { ok: true, assigned };
}

/** Take a whole batch off the calendar. The pieces and their copy are untouched. */
export async function clearBatchSchedule(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: posts, error } = await supabase
    .from("posts")
    .update({ scheduled_on: null, scheduled_time: null })
    .eq("batch_id", batchId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!posts) return { ok: false, error: "No se encontró el lote." };

  return { ok: true };
}
