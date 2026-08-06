import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  analyzePublishedHistory,
  HISTORY_MODEL,
} from "@/lib/ai/analyze-history";
import { logGeneration } from "@/lib/ai/log-generation";

/*
  Extracts the angles and hooks a brand has already used, and stores them on the
  brand.

  Runs once per history change, not per batch — which is the whole reason the
  two-step design is affordable. Reading every published caption is the
  expensive part; the result is a few hundred tokens of prohibitions that every
  subsequent batch carries for almost nothing.

  ~16s observed on 8 captions. 60s leaves room for a longer history without
  letting a wedged request sit.
*/
export const maxDuration = 60;

/**
 * Ceiling on captions sent for analysis.
 *
 * Newest first, so a long-running account still gets its CURRENT voice
 * analysed rather than whatever it was doing three years ago. Also bounds the
 * input cost, which is the only part of this that scales with history size.
 */
const MAX_CAPTIONS = 60;

const requestSchema = z.object({ brandId: z.uuid() });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  let workspaceId: string;
  try {
    workspaceId = await requireWorkspaceId();
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "No autorizado." },
      { status: 401 },
    );
  }

  const { brandId } = parsed.data;
  const supabase = await createClient();

  // RLS scopes both of these; a brand from another workspace reads as missing.
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", brandId)
    .maybeSingle();

  if (brandError) {
    return NextResponse.json({ error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ error: "No se encontró la marca." }, { status: 404 });
  }

  const { data: posts, error: postsError } = await supabase
    .from("brand_published_posts")
    .select("caption")
    .eq("brand_id", brandId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_CAPTIONS);

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 });
  }

  const captions = (posts ?? []).map((post) => post.caption);
  if (captions.length === 0) {
    return NextResponse.json(
      { error: "Esta marca no tiene contenido publicado cargado todavía." },
      { status: 400 },
    );
  }

  try {
    const result = await analyzePublishedHistory(captions);

    const { error: updateError } = await supabase
      .from("brands")
      .update({
        content_analysis: result.analysis as never,
        content_analysis_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    if (updateError) throw new Error(updateError.message);

    await logGeneration({
      workspaceId,
      brandId,
      kind: "text",
      provider: "anthropic",
      model: HISTORY_MODEL,
      input: {
        captionCount: captions.length,
        promptVersion: result.promptVersion,
      },
      output: {
        angles: result.analysis.angles.map((angle) => angle.slug),
        hooks: result.analysis.hooks.length,
        phrases: result.analysis.phrases.length,
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
      analysis: result.analysis,
      captionCount: captions.length,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falló el análisis.";

    await logGeneration({
      workspaceId,
      brandId,
      kind: "text",
      provider: "anthropic",
      model: HISTORY_MODEL,
      input: { captionCount: captions.length },
      output: {},
      ok: false,
      error: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
