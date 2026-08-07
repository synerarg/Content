import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceId } from "@/lib/workspace";
import { fetchSitePage } from "@/lib/web/safe-fetch";
import { extractSite, toPaletteTokens } from "@/lib/web/extract-brand";
import { WEBSITE_MODEL, analyzeWebsite } from "@/lib/ai/analyze-website";
import { logGeneration } from "@/lib/ai/log-generation";
import { codeOf } from "@/lib/errors";

/*
  Fetching a site plus one structured call: usually 10-25s, and the fetch has
  its own 12s ceiling inside.
*/
export const maxDuration = 60;

const requestSchema = z.object({
  url: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pegá la URL del sitio." }, { status: 400 });
  }

  /*
    Authenticated before anything is fetched.

    This route makes the server open a connection to an address the caller
    chose. Even with the SSRF guards in lib/web/safe-fetch.ts, leaving it open
    to anonymous callers would turn the deployment into a general-purpose
    request proxy that anyone could point anywhere.
  */
  let workspaceId: string;
  try {
    workspaceId = await requireWorkspaceId();
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "No autorizado." },
      { status: 401 },
    );
  }

  try {
    const page = await fetchSitePage(parsed.data.url);
    const site = extractSite(page.html);

    const result = await analyzeWebsite({
      url: page.finalUrl,
      site,
      truncated: page.truncated,
    });

    /*
      Logged with a null brandId: this call happens BEFORE the brand exists,
      which is the whole point of it. The spend is real and belongs in the
      workspace's total either way.
    */
    await logGeneration({
      workspaceId,
      brandId: null,
      kind: "text",
      provider: "anthropic",
      model: WEBSITE_MODEL,
      input: {
        url: page.finalUrl,
        promptVersion: result.promptVersion,
        truncated: page.truncated,
        textLength: site.text.length,
      },
      output: {
        confidence: result.analysis.confidence,
        colors: site.colors.length,
        fonts: site.fonts,
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
      url: page.finalUrl,
      // A name to start from. The <title> is usually "Marca | qué hacen", so
      // only the part before the separator is worth offering.
      suggestedName:
        site.meta.siteName ??
        site.meta.title?.split(/[|·—–-]/)[0]?.trim() ??
        null,
      palette: toPaletteTokens(site.colors),
      colors: site.colors,
      fonts: site.fonts,
      analysis: result.analysis,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "No se pudo leer el sitio.";

    await logGeneration({
      workspaceId,
      brandId: null,
      kind: "text",
      provider: "anthropic",
      model: WEBSITE_MODEL,
      input: { url: parsed.data.url },
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
