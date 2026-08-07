import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  WEBSITE_PROMPT_VERSION,
  buildWebsiteSystemPrompt,
  buildWebsiteUserPrompt,
} from "@/prompts/website-analysis";
import type { ExtractedSite } from "@/lib/web/extract-brand";
import { CodedError } from "@/lib/errors";
import { parseWithRetry } from "./parse-with-retry";
import { estimateCostUsd } from "./pricing";

export const WEBSITE_MODEL = "claude-sonnet-5";

/*
  The voice half of a Brand Kit, read off a website.

  Lenient about length for the usual reason (see lib/ai/slot-limits.ts), and
  trimmed on the way out against the same limits brandFormSchema enforces — a
  draft that fails the form's own validation the moment it loads would be worse
  than no draft.
*/
export const websiteAnalysisSchema = z.object({
  tagline: z.string(),
  tone_of_voice: z.string(),
  target_audience: z.string(),
  example_captions: z.array(z.string()),
  art_direction: z.object({
    photographic_style: z.string(),
    lighting: z.string(),
    palette_notes: z.string(),
    avoid: z.array(z.string()),
  }),
  confidence: z.enum(["alta", "media", "baja"]),
  notes: z.string(),
});

export type WebsiteAnalysis = z.infer<typeof websiteAnalysisSchema>;

export type AnalyzeWebsiteResult = {
  analysis: WebsiteAnalysis;
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

/** Ceilings from lib/schemas/brand.ts, so the draft always loads into the form. */
const LIMITS = {
  tagline: 200,
  tone_of_voice: 4000,
  target_audience: 2000,
  example_captions: 2200,
  photographic_style: 2000,
  lighting: 1000,
  palette_notes: 1000,
  avoid: 120,
} as const;

function clamp(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : trimmed.slice(0, limit).trimEnd();
}

export async function analyzeWebsite(input: {
  url: string;
  site: ExtractedSite;
  truncated: boolean;
}): Promise<AnalyzeWebsiteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CodedError(
      "config",
      "Falta ANTHROPIC_API_KEY. Agregala a .env.local para leer un sitio.",
    );
  }

  // A page with almost no words cannot produce a useful draft, and calling the
  // model to be told so costs money to learn nothing.
  if (input.site.text.trim().length < 200) {
    throw new CodedError(
      "validation",
      "Esa página casi no tiene texto. Probá con la home del cliente, o cargá la marca a mano.",
    );
  }

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await parseWithRetry(() =>
    client.messages.parse({
      model: WEBSITE_MODEL,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: buildWebsiteSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildWebsiteUserPrompt({
            url: input.url,
            title: input.site.meta.title,
            description: input.site.meta.description,
            siteName: input.site.meta.siteName,
            text: input.site.text,
            truncated: input.truncated,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(websiteAnalysisSchema) },
    }),
  );

  const durationMs = Date.now() - started;

  if (response.stop_reason === "refusal") {
    throw new CodedError("safety", "El modelo rechazó leer ese sitio.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new CodedError(
      "too_long",
      "La respuesta se cortó por límite de tokens. Probá con una página más corta.",
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new CodedError(
      "provider",
      "El modelo no devolvió un borrador con el formato esperado.",
    );
  }

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    analysis: {
      tagline: clamp(parsed.tagline, LIMITS.tagline),
      tone_of_voice: clamp(parsed.tone_of_voice, LIMITS.tone_of_voice),
      target_audience: clamp(parsed.target_audience, LIMITS.target_audience),
      example_captions: parsed.example_captions
        .map((caption) => clamp(caption, LIMITS.example_captions))
        .filter(Boolean)
        .slice(0, 10),
      art_direction: {
        photographic_style: clamp(
          parsed.art_direction.photographic_style,
          LIMITS.photographic_style,
        ),
        lighting: clamp(parsed.art_direction.lighting, LIMITS.lighting),
        palette_notes: clamp(parsed.art_direction.palette_notes, LIMITS.palette_notes),
        avoid: parsed.art_direction.avoid
          .map((item) => clamp(item, LIMITS.avoid))
          .filter(Boolean)
          .slice(0, 30),
      },
      confidence: parsed.confidence,
      notes: parsed.notes.trim(),
    },
    usage,
    costUsd: estimateCostUsd(WEBSITE_MODEL, usage),
    durationMs,
    promptVersion: WEBSITE_PROMPT_VERSION,
  };
}
