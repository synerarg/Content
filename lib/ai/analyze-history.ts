import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  HISTORY_PROMPT_VERSION,
  buildHistorySystemPrompt,
  buildHistoryUserPrompt,
} from "@/prompts/history-analysis";
import { estimateCostUsd } from "./pricing";

export const HISTORY_MODEL = "claude-sonnet-5";

/*
  Runs ONCE PER HISTORY SYNC, not per batch.

  That is what makes the two-step design affordable: the expensive part is
  reading every published caption, and the result — a short list of named
  angles — is stable until new posts arrive. Batches then carry a few hundred
  tokens of prohibitions instead of the full history.

  Lenient strings throughout: structured outputs strips minLength/maxLength
  before sending and then validates client-side, so a limit here would fail a
  good analysis without the model ever having seen the constraint.
*/

export const historyAnalysisSchema = z.object({
  angles: z.array(
    z.object({
      /** Short kebab-case identifier, e.g. "competencia-ya-lo-hizo". */
      slug: z.string(),
      /** One line describing the argument, so the batch prompt can forbid it. */
      gist: z.string(),
      /**
       * Terms that would appear literally in a text reusing this angle.
       * These make the prohibition CHECKABLE after generation, not just stated.
       */
      keywords: z.array(z.string()),
    }),
  ),
  hooks: z.array(z.string()),
  phrases: z.array(z.string()),
});

export type HistoryAnalysis = z.infer<typeof historyAnalysisSchema>;

export type AnalyzeHistoryResult = {
  analysis: HistoryAnalysis;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  costUsd: number | null;
  durationMs: number;
  promptVersion: string;
};

export async function analyzePublishedHistory(
  captions: string[],
): Promise<AnalyzeHistoryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY. Agregala a .env.local.");
  }
  if (captions.length === 0) {
    throw new Error("No hay contenido publicado para analizar.");
  }

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await client.messages.parse({
    model: HISTORY_MODEL,
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: buildHistorySystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildHistoryUserPrompt(captions) }],
    output_config: { format: zodOutputFormat(historyAnalysisSchema) },
  });

  const durationMs = Date.now() - started;

  if (response.stop_reason === "max_tokens") {
    throw new Error("El análisis se cortó por límite de tokens.");
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("El modelo no devolvió un análisis con el formato esperado.");
  }

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    analysis: {
      angles: parsed.angles.map((angle) => ({
        slug: angle.slug.trim(),
        gist: angle.gist.trim(),
        keywords: angle.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
      })),
      hooks: parsed.hooks.map((h) => h.trim()).filter(Boolean),
      phrases: parsed.phrases.map((p) => p.trim()).filter(Boolean),
    },
    usage,
    costUsd: estimateCostUsd(HISTORY_MODEL, usage),
    durationMs,
    promptVersion: HISTORY_PROMPT_VERSION,
  };
}
