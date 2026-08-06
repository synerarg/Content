import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { generatePost, GENERATION_MODEL } from "@/lib/ai/generate-post";
import { logGeneration } from "@/lib/ai/log-generation";
import { FORMAT_KEYS, type FormatKey } from "@/templates/types";

/*
  Claude runs ~10-25s for a full post. Vercel's default is 300s on every plan,
  so 60 is comfortable headroom while still failing fast if something wedges.

  The response is a small JSON object, nowhere near the 4.5 MB body cap — unlike
  the image and ZIP paths, which deliberately never route through a function.
*/
export const maxDuration = 60;

const requestSchema = z.object({
  brandId: z.uuid(),
  brief: z.string().trim().min(8, "Contame un poco más sobre el posteo.").max(2000),
  format: z.enum(FORMAT_KEYS as [FormatKey, ...FormatKey[]]).nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida." },
      { status: 400 },
    );
  }

  const { brandId, brief, format } = parsed.data;

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

  // RLS scopes this to the caller's workspace, so a brand from another tenant
  // simply is not found.
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

  const input = {
    brandName: brand.name,
    toneOfVoice: brand.tone_of_voice ?? "",
    targetAudience: brand.target_audience ?? "",
    exampleCaptions: brand.example_captions ?? [],
    brief,
    requestedFormat: format ?? null,
  };

  try {
    const result = await generatePost(input);

    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: GENERATION_MODEL,
      input: { brief, format: format ?? null, promptVersion: result.promptVersion },
      output: {
        templateSlug: result.templateSlug,
        format: result.format,
        slots: result.slots,
        caption: result.caption,
        hashtags: result.hashtags,
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

    return NextResponse.json(result);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Falló la generación.";

    // Failures are logged too. A run of refusals or timeouts is exactly the
    // kind of thing you want visible in the cost/usage view.
    await logGeneration({
      workspaceId,
      brandId: brand.id,
      kind: "text",
      provider: "anthropic",
      model: GENERATION_MODEL,
      input: { brief, format: format ?? null },
      output: {},
      ok: false,
      error: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
