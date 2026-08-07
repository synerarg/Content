import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import { indexBrand } from "@/lib/content/duplicates";
import { EMBEDDING_MODEL } from "@/lib/ai/embeddings";
import { logGeneration } from "@/lib/ai/log-generation";
import { codeOf } from "@/lib/errors";

/*
  Backfill: embed everything for a brand that has no vector yet.

  Batched 50 at a time inside, so a brand with a few hundred published captions
  is a handful of requests rather than one per row. 120s because the ceiling
  that matters is the number of ROWS, not the model — each batch answers in
  well under a second.
*/
export const maxDuration = 120;

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

  const supabase = await createClient();
  const started = Date.now();

  try {
    // RLS scopes everything inside to the caller's workspace, so a brand id
    // from elsewhere simply finds no rows to index.
    const { published, generated } = await indexBrand(supabase, parsed.data.brandId);

    const errors = [published.error, generated.error].filter(Boolean) as string[];

    await logGeneration({
      workspaceId,
      brandId: parsed.data.brandId,
      kind: "text",
      provider: "google",
      model: EMBEDDING_MODEL,
      input: { action: "backfill-embeddings" },
      output: {
        published: published.indexed,
        generated: generated.indexed,
        errors,
      },
      durationMs: Date.now() - started,
      // Partial success is still success: whatever got indexed is indexed, and
      // pressing the button again picks up only what is still missing.
      ok: errors.length === 0,
      error: errors.join(" ") || null,
    });

    return NextResponse.json({
      published: published.indexed,
      generated: generated.indexed,
      errors,
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "No se pudo indexar la marca.";

    await logGeneration({
      workspaceId,
      brandId: parsed.data.brandId,
      kind: "text",
      provider: "google",
      model: EMBEDDING_MODEL,
      input: { action: "backfill-embeddings" },
      output: {},
      durationMs: Date.now() - started,
      ok: false,
      error: message,
    });

    return NextResponse.json({ error: message, code: codeOf(cause) }, { status: 500 });
  }
}
