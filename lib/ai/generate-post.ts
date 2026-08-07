import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  TEMPLATES,
  getTemplate,
  type AnyTemplateDefinition,
} from "@/templates/registry";
import { FORMAT_KEYS, type FormatKey } from "@/templates/types";
import {
  POST_GENERATION_PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
} from "@/prompts/post-generation";
import { CodedError } from "@/lib/errors";
import { parseWithRetry } from "./parse-with-retry";
import { trimToLimits } from "./slot-limits";
import { estimateCostUsd } from "./pricing";

export const GENERATION_MODEL = "claude-sonnet-5";

/*
  Structured generation.

  Claude Sonnet 5 supports structured outputs (output_config.format), so the
  response is schema-constrained rather than "please reply with JSON" plus a
  parser and a repair loop. Malformed JSON is not a failure mode we have to
  handle at all.

  What we DO handle is length. Structured outputs does not support string
  minLength/maxLength — the SDK strips those constraints before sending and
  validates them client-side. Leaving the template's `.max()` rules in the
  AI-facing schema would therefore mean the model never sees the limit but the
  parse still fails over it, killing an otherwise good generation because a
  headline came back at 93 characters instead of 90.

  So the AI-facing schema is deliberately lenient (plain strings), the limits
  are stated in the prompt where the model can actually act on them, and any
  overflow is trimmed afterwards with a warning.
*/

/** Slot schema with no length constraints, for the API-facing JSON Schema. */
function lenientSlots(template: AnyTemplateDefinition) {
  const shape: Record<string, z.ZodString> = {};
  for (const key of Object.keys(template.slots.shape)) {
    shape[key] = z.string();
  }
  return z.object(shape);
}

const templateVariants = TEMPLATES.map((template) =>
  z.object({
    template_slug: z.literal(template.slug),
    slots: lenientSlots(template),
  }),
);

const choiceSchema = z.union(
  templateVariants as unknown as [
    (typeof templateVariants)[number],
    (typeof templateVariants)[number],
    ...(typeof templateVariants)[number][],
  ],
);

export const generationSchema = z.object({
  choice: choiceSchema,
  format: z.enum(FORMAT_KEYS as [FormatKey, ...FormatKey[]]),
  caption: z.string(),
  hashtags: z.array(z.string()),
  rationale: z.string(),
});

export type GenerationOutput = z.infer<typeof generationSchema>;

export type GeneratePostInput = {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  requestedFormat: FormatKey | null;
};

export type GeneratePostResult = {
  templateSlug: string;
  format: FormatKey;
  slots: Record<string, string>;
  caption: string;
  hashtags: string[];
  rationale: string;
  warnings: string[];
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

export async function generatePost(
  input: GeneratePostInput,
): Promise<GeneratePostResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CodedError(
      "config",
      "Falta ANTHROPIC_API_KEY. Agregala a .env.local para generar contenido.",
    );
  }

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await parseWithRetry(() =>
    client.messages.parse({
      model: GENERATION_MODEL,
      max_tokens: 8000,
      // The system block is identical for every brand and every request, which
      // makes it a stable cacheable prefix. Brand context deliberately goes in
      // the user turn so it never invalidates that cache.
      system: [
        {
          type: "text",
          text: buildSystemPrompt(TEMPLATES),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormat(generationSchema) },
    }),
  );

  const durationMs = Date.now() - started;

  if (response.stop_reason === "refusal") {
    throw new CodedError(
      "safety",
      "El modelo rechazó el pedido. Revisá el brief y probá de nuevo.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new CodedError(
      "too_long",
      "La respuesta se cortó por límite de tokens. Probá con un brief más corto.",
    );
  }

  // parseWithRetry throws before this when nothing parsed, so reaching here
  // with a null output is impossible; the check keeps the type narrow.
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new CodedError(
      "provider",
      "El modelo no devolvió una respuesta con el formato esperado.",
    );
  }

  const template = getTemplate(parsed.choice.template_slug);
  if (!template) {
    throw new Error(
      `El modelo eligió una plantilla desconocida: ${parsed.choice.template_slug}`,
    );
  }

  const { slots, warnings } = trimToLimits(
    template,
    parsed.choice.slots as Record<string, string>,
  );

  // The model may pick a format the chosen template does not support; fall back
  // rather than render something the template cannot lay out.
  let format = parsed.format;
  if (!template.formats.includes(format)) {
    warnings.push(
      `La plantilla "${template.slug}" no soporta ${format}; se usó ${template.formats[0]}.`,
    );
    format = template.formats[0];
  }

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    templateSlug: template.slug,
    format,
    slots,
    caption: parsed.caption.trim(),
    hashtags: parsed.hashtags
      .map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean),
    rationale: parsed.rationale.trim(),
    warnings,
    usage,
    costUsd: estimateCostUsd(GENERATION_MODEL, usage),
    durationMs,
    promptVersion: POST_GENERATION_PROMPT_VERSION,
  };
}
