import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Append a row to the generations audit log.
 *
 * Never throws. A logging failure must not lose the user the content they just
 * paid a model to produce — the call already succeeded by the time we get here.
 * Failures are reported to the server console instead.
 */
export async function logGeneration(entry: {
  workspaceId: string;
  brandId: string | null;
  kind: "text" | "image";
  provider: string;
  model: string;
  input: unknown;
  output: unknown;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number | null;
  durationMs?: number;
  ok: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("generations").insert({
      workspace_id: entry.workspaceId,
      brand_id: entry.brandId,
      kind: entry.kind,
      provider: entry.provider,
      model: entry.model,
      input: entry.input as never,
      output: entry.output as never,
      input_tokens: entry.inputTokens ?? null,
      output_tokens: entry.outputTokens ?? null,
      cache_read_tokens: entry.cacheReadTokens ?? null,
      cache_write_tokens: entry.cacheWriteTokens ?? null,
      cost_estimate_usd: entry.costUsd ?? null,
      duration_ms: entry.durationMs ?? null,
      ok: entry.ok,
      error: entry.error ?? null,
    });

    if (error) {
      console.error("[generations] insert failed:", error.message);
    }
  } catch (cause) {
    console.error("[generations] insert threw:", cause);
  }
}
