import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { generateBatch, BATCH_MODEL } from "@/lib/ai/generate-batch";
import { logGeneration } from "@/lib/ai/log-generation";
import { codeOf } from "@/lib/errors";
import {
  describeMatch,
  findSimilar,
  indexPosts,
} from "@/lib/content/duplicates";
import { templateUsesProduct } from "@/templates/registry";
import { historyAnalysisSchema } from "@/lib/ai/analyze-history";
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
  /** Optional: the product every standalone piece in this batch is about. */
  productId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida." },
      { status: 400 },
    );
  }

  const { brandId, brief, recipe, productId } = parsed.data;

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
    .select(
      "id, name, tone_of_voice, target_audience, example_captions, content_analysis",
    )
    .eq("id", brandId)
    .maybeSingle();

  if (brandError) {
    return NextResponse.json({ error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ error: "No se encontró la marca." }, { status: 404 });
  }

  /*
    Angles this brand has already used, forbidden by name in the prompt.

    Validated rather than cast: the column holds model output written by
    whatever version of the extraction prompt was current at the time, and a
    shape change must degrade to "no prohibitions" instead of throwing mid-batch.
    An unanalysed brand has `{}` here, which fails the parse and is treated the
    same way — undefined, so no section is emitted at all.
  */
  const analysis = historyAnalysisSchema.safeParse(brand.content_analysis);
  const usedAngles =
    analysis.success && analysis.data.angles.length > 0 ? analysis.data : undefined;

  /*
    The product, resolved and scoped to THIS brand.

    Filtered on brand_id as well as id, so a request naming another client's
    product gets "no encontrado" rather than that client's photo on this
    client's piece. RLS already bounds it to the workspace; this bounds it to
    the brand, which the database cannot (slides carry no brand_id — see
    migration 0013).
  */
  let product: { id: string; name: string; description: string } | null = null;
  if (productId) {
    const { data: row, error: productError } = await supabase
      .from("brand_products")
      .select("id, name, description")
      .eq("id", productId)
      .eq("brand_id", brand.id)
      .maybeSingle();

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json(
        { error: "No se encontró el producto en esta marca." },
        { status: 404 },
      );
    }
    product = { id: row.id, name: row.name, description: row.description ?? "" };
  }

  try {
    const result = await generateBatch({
      brandName: brand.name,
      toneOfVoice: brand.tone_of_voice ?? "",
      targetAudience: brand.target_audience ?? "",
      exampleCaptions: brand.example_captions ?? [],
      brief,
      recipe,
      usedAngles,
      product: product
        ? { name: product.name, description: product.description }
        : undefined,
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
        /*
          Written only where the template actually composites one.

          Setting it on every slide would be harmless to render — a template
          that ignores `product` ignores it — but it would make the export gate
          and any future "which pieces show the product" question answer wrong,
          and it would put a product reference on carousel slides that can never
          display it.
        */
        product_id:
          product && templateUsesProduct(slide.templateSlug) ? product.id : null,
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

    /*
      Semantic near-duplicate check.

      This is the check HANDOFF §10 says is missing: the keyword metric built
      for the published-history work scored 0/7 on a run that had visibly
      repeated itself, because it needed literal matches of phrases that never
      reappear verbatim. Embeddings see "un catálogo de fotos no cobra" next to
      "no es un catálogo de fotos"; keywords never did.

      Embeddings are stored FIRST and every piece is then compared against
      everything including its own siblings, so a batch that repeats ITSELF is
      caught too — which the recipe's "distinct angle" instruction asks for but
      cannot enforce.

      Entirely best-effort: the batch has already been written and paid for, so
      a failure here becomes a warning and nothing else.
    */
    const savedPosts = (insertedPosts ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((row, index) => ({
        id: row.id,
        caption: result.posts[index]?.caption ?? "",
      }))
      .filter((post) => post.caption.trim().length > 0);

    const indexed = await indexPosts(supabase, savedPosts);

    if (indexed.error) {
      result.warnings.push(
        `No se pudo revisar si el lote repite contenido: ${indexed.error}`,
      );
    } else {
      for (const [index, post] of savedPosts.entries()) {
        const embedding = indexed.embeddings.get(post.id);
        if (!embedding) continue;

        const matches = await findSimilar(supabase, brand.id, embedding, {
          excludePostId: post.id,
        });
        // Only the nearest one per piece. Three warnings about the same piece
        // is how a useful signal becomes noise people dismiss.
        if (matches[0]) {
          result.warnings.push(describeMatch(index, matches[0]));
        }
      }
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
        productId: product?.id ?? null,
        // Recorded so a batch that repeats itself can be traced to whether it
        // was generated with prohibitions at all, and which ones.
        forbiddenAngles: usedAngles?.angles.map((angle) => angle.slug) ?? [],
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

    return NextResponse.json(
      { error: message, code: codeOf(cause) },
      { status: 500 },
    );
  }
}
