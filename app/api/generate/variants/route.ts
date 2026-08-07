import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  VARIANTS_MODEL,
  VARIANT_COUNT,
  generateCaptionVariants,
  generateSlotVariants,
} from "@/lib/ai/generate-variants";
import { logGeneration } from "@/lib/ai/log-generation";
import { historyAnalysisSchema } from "@/lib/ai/analyze-history";
import { codeOf } from "@/lib/errors";
import { getTemplate } from "@/templates/registry";
import { POST_KINDS } from "@/lib/batch/recipe";
import { FORMAT_KEYS, type FormatKey } from "@/templates/types";

/*
  One small structured call — three alternatives for a single piece — so it runs
  far shorter than a batch. 60s is the same ceiling the single-post route uses.
*/
export const maxDuration = 60;

/*
  Deliberately content-in, content-out rather than id-in.

  Two screens need this and only one of them has persisted rows: /editor holds a
  piece that exists nowhere but in the browser until it is exported. Taking the
  current text in the request serves both, and the security question it raises
  answers itself — the caller can only ask for alternatives to text it already
  has. Everything that must be trusted (the brand's voice, its published
  history) is still read from the database by id.
*/
const requestSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("slots"),
    brandId: z.uuid(),
    templateSlug: z.string().trim().min(1).max(80),
    format: z.enum(FORMAT_KEYS as [FormatKey, ...FormatKey[]]),
    current: z.record(z.string(), z.string()),
    sceneBrief: z.string().max(2000).optional(),
    count: z.number().int().min(VARIANT_COUNT.min).max(VARIANT_COUNT.max),
  }),
  z.object({
    target: z.literal("caption"),
    brandId: z.uuid(),
    postType: z.enum(POST_KINDS),
    current: z.object({
      caption: z.string().max(4000),
      hashtags: z.array(z.string().max(60)).max(30),
      cta: z.string().max(200),
    }),
    slideText: z.string().max(4000).optional(),
    count: z.number().int().min(VARIANT_COUNT.min).max(VARIANT_COUNT.max),
  }),
]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida." },
      { status: 400 },
    );
  }

  const body = parsed.data;

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
    .select("id, name, tone_of_voice, target_audience, example_captions, content_analysis")
    .eq("id", body.brandId)
    .maybeSingle();

  if (brandError) {
    return NextResponse.json({ error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ error: "No se encontró la marca." }, { status: 404 });
  }

  // Same validation-not-cast treatment as the batch route: this column holds
  // model output written by whatever version of the extraction prompt was
  // current, and a shape change must degrade to "no prohibitions".
  const analysis = historyAnalysisSchema.safeParse(brand.content_analysis);
  const usedAngles =
    analysis.success && analysis.data.angles.length > 0 ? analysis.data : undefined;

  const brandContext = {
    brandName: brand.name,
    toneOfVoice: brand.tone_of_voice ?? "",
    targetAudience: brand.target_audience ?? "",
    exampleCaptions: brand.example_captions ?? [],
  };

  try {
    if (body.target === "slots") {
      const template = getTemplate(body.templateSlug);
      if (!template) {
        return NextResponse.json(
          { error: `Plantilla desconocida: ${body.templateSlug}.` },
          { status: 400 },
        );
      }

      const result = await generateSlotVariants({
        brand: brandContext,
        usedAngles,
        template,
        format: body.format,
        current: body.current,
        count: body.count,
        sceneBrief: body.sceneBrief,
      });

      await logGeneration({
        workspaceId,
        brandId: brand.id,
        kind: "text",
        provider: "anthropic",
        model: VARIANTS_MODEL,
        input: {
          target: "slots",
          templateSlug: body.templateSlug,
          format: body.format,
          count: body.count,
          promptVersion: result.promptVersion,
          forbiddenAngles: usedAngles?.angles.map((angle) => angle.slug) ?? [],
        },
        output: {
          variants: result.variants.length,
          angles: result.variants.map((variant) => variant.angle),
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
        target: "slots",
        variants: result.variants,
        warnings: result.warnings,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      });
    }

    const result = await generateCaptionVariants({
      brand: brandContext,
      usedAngles,
      postType: body.postType,
      current: body.current,
      count: body.count,
      slideText: body.slideText,
    });

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: VARIANTS_MODEL,
      input: {
        target: "caption",
        postType: body.postType,
        count: body.count,
        promptVersion: result.promptVersion,
        forbiddenAngles: usedAngles?.angles.map((angle) => angle.slug) ?? [],
      },
      output: {
        variants: result.variants.length,
        angles: result.variants.map((variant) => variant.angle),
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
      target: "caption",
      variants: result.variants,
      warnings: result.warnings,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Falló la generación de variantes.";

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: VARIANTS_MODEL,
      input: { target: body.target, count: body.count },
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
