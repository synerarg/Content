import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { generateBatch, BATCH_MODEL } from "@/lib/ai/generate-batch";
import { logGeneration } from "@/lib/ai/log-generation";
import {
  describeRecipe,
  recipeSchema,
  totalSlides,
} from "@/lib/batch/recipe";

/*
  A batch is several posts of copy in one call, with adaptive thinking on top,
  so it runs longer than a single post — typically 30-70s. Still far inside the
  300s floor every Vercel plan allows.

  Only JSON crosses this boundary. Background images are generated separately,
  per slide, through the image route.
*/
export const maxDuration = 180;

const requestSchema = z.object({
  brandId: z.uuid(),
  brief: z.string().trim().min(8, "Contame un poco más sobre el lote.").max(2000),
  // The recipe's own schema carries the ceilings and the per-type slide rules,
  // so the route validates the exact same contract the browser built against.
  recipe: recipeSchema,
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida." },
      { status: 400 },
    );
  }

  const { brandId, brief, recipe } = parsed.data;

  let workspaceId: string;
  try {
    workspaceId = await requireWorkspaceId();
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "No autorizado." },
      { status: 401 },
    );
  }

  const supabase = await createClient();

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, name, tone_of_voice, target_audience, example_captions")
    .eq("id", brandId)
    .maybeSingle();

  if (brandError) {
    return NextResponse.json({ error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ error: "No se encontró la marca." }, { status: 404 });
  }

  try {
    const result = await generateBatch({
      brandName: brand.name,
      toneOfVoice: brand.tone_of_voice ?? "",
      targetAudience: brand.target_audience ?? "",
      exampleCaptions: brand.example_captions ?? [],
      brief,
      recipe,
    });

    const { data: batch, error: batchError } = await supabase
      .from("content_batches")
      .insert({
        workspace_id: workspaceId,
        brand_id: brand.id,
        title: result.title,
        brief,
        status: "ready",
      })
      .select("id")
      .single();

    if (batchError) throw new Error(batchError.message);

    // Posts first, then slides keyed to the returned post ids. Two round trips
    // rather than one per post: a batch of six with carousels would otherwise
    // be a dozen sequential inserts.
    const { data: insertedPosts, error: postsError } = await supabase
      .from("posts")
      .insert(
        result.posts.map((post, index) => ({
          workspace_id: workspaceId,
          batch_id: batch.id,
          position: index,
          type: post.type,
          caption: post.caption,
          hashtags: post.hashtags,
          cta: post.cta,
        })),
      )
      .select("id, position");

    if (postsError) throw new Error(postsError.message);

    const postIdByPosition = new Map(
      (insertedPosts ?? []).map((row) => [row.position, row.id]),
    );

    const slideRows = result.posts.flatMap((post, postIndex) => {
      const postId = postIdByPosition.get(postIndex);
      if (!postId) return [];

      return post.slides.map((slide, slideIndex) => ({
        workspace_id: workspaceId,
        post_id: postId,
        position: slideIndex,
        template_slug: slide.templateSlug,
        format: post.format,
        slots: slide.slots as never,
        background_path: null,
        // Carries the scene forward so a background can be generated later, and
        // so every slide in a carousel asks for the same one.
        generation_params: {
          backgroundBrief: post.backgroundBrief,
          promptVersion: result.promptVersion,
        } as never,
      }));
    });

    if (slideRows.length > 0) {
      const { error: slidesError } = await supabase.from("slides").insert(slideRows);
      if (slidesError) throw new Error(slidesError.message);
    }

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: BATCH_MODEL,
      input: {
        brief,
        recipe,
        recipeLabel: describeRecipe(recipe),
        promptVersion: result.promptVersion,
      },
      output: {
        batchId: batch.id,
        title: result.title,
        posts: result.posts.length,
        slides: slideRows.length,
        // Logged next to what came back so an under-delivering batch is
        // visible in the audit trail, not only in a toast the user dismissed.
        requestedSlides: totalSlides(recipe),
        warnings: result.warnings,
      },
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      ok: true,
    });

    return NextResponse.json({
      batchId: batch.id,
      title: result.title,
      posts: result.posts.length,
      slides: slideRows.length,
      warnings: result.warnings,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falló la generación.";

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: BATCH_MODEL,
      input: { brief, recipe, recipeLabel: describeRecipe(recipe) },
      output: {},
      ok: false,
      error: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
