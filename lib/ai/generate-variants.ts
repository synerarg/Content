import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AnyTemplateDefinition } from "@/templates/registry";
import {
  VARIANTS_PROMPT_VERSION,
  buildCaptionVariantsPrompt,
  buildSlotVariantsPrompt,
  buildVariantsSystemPrompt,
} from "@/prompts/variants";
import type { UsedAngles } from "@/prompts/batch-generation";
import { CodedError } from "@/lib/errors";
import { parseWithRetry } from "./parse-with-retry";
import { trimToLimits } from "./slot-limits";
import { estimateCostUsd } from "./pricing";

export const VARIANTS_MODEL = "claude-sonnet-5";

/** How many options are worth reading before the list stops being a choice. */
export const VARIANT_COUNT = { min: 2, max: 5, default: 3 } as const;

/*
  Alternatives for one piece that already exists.

  The whole slide's slots move together rather than one slot at a time. That is
  the difference between an alternative and a mess: a new headline against the
  old subline reads as two people writing, and the subline usually leans on the
  headline's argument. Same for a caption, which travels with its CTA and its
  hashtags.

  Length is handled the way it is everywhere else here — lenient AI-facing
  schema, limits in the prompt, overflow trimmed afterwards. See
  lib/ai/slot-limits.ts for why the schema cannot carry them.
*/

/** Everything about the brand these prompts need. Read from the database, never sent by the caller. */
export type BrandContext = {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
};

export type VariantUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type SlotVariant = {
  angle: string;
  slots: Record<string, string>;
};

export type CaptionVariant = {
  angle: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

export type VariantsResult<T> = {
  variants: T[];
  warnings: string[];
  usage: VariantUsage;
  costUsd: number | null;
  durationMs: number;
  promptVersion: string;
};

function lenientSlots(template: AnyTemplateDefinition) {
  const shape: Record<string, z.ZodString> = {};
  for (const key of Object.keys(template.slots.shape)) {
    shape[key] = z.string();
  }
  return z.object(shape);
}

function apiKeyOrThrow(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CodedError(
      "config",
      "Falta ANTHROPIC_API_KEY. Agregala a .env.local para generar variantes.",
    );
  }
  return apiKey;
}

function readUsage(response: {
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}): VariantUsage {
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Stop reasons that mean something specific, translated once.
 *
 * `refusal` and `max_tokens` are deliberately NOT retried by parseWithRetry —
 * both are deterministic, so a retry burns a second call to reach the same
 * place. See lib/ai/parse-with-retry.ts.
 */
function assertUsableStop(stopReason: string | null | undefined) {
  if (stopReason === "refusal") {
    throw new CodedError(
      "safety",
      "El modelo rechazó el pedido. Revisá el texto de la pieza.",
    );
  }
  if (stopReason === "max_tokens") {
    throw new CodedError(
      "too_long",
      "La respuesta se cortó por límite de tokens. Pedí menos opciones.",
    );
  }
}

export async function generateSlotVariants(input: {
  brand: BrandContext;
  usedAngles?: UsedAngles;
  template: AnyTemplateDefinition;
  format: string;
  current: Record<string, string>;
  count: number;
  sceneBrief?: string;
}): Promise<VariantsResult<SlotVariant>> {
  const client = new Anthropic({ apiKey: apiKeyOrThrow() });
  const started = Date.now();

  const schema = z.object({
    options: z.array(
      z.object({
        angle: z.string(),
        slots: lenientSlots(input.template),
      }),
    ),
  });

  const response = await parseWithRetry(() =>
    client.messages.parse({
      model: VARIANTS_MODEL,
      // Three alternatives for one slide is a small answer; the ceiling is
      // there to make a runaway response fail fast rather than expensively.
      max_tokens: 4000,
      // Identical for every brand and every request, so it is a stable
      // cacheable prefix. Brand context goes in the user turn, where it cannot
      // invalidate that cache.
      system: [
        {
          type: "text",
          text: buildVariantsSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildSlotVariantsPrompt({
            ...input.brand,
            usedAngles: input.usedAngles,
            template: input.template,
            format: input.format,
            current: input.current,
            count: input.count,
            sceneBrief: input.sceneBrief,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    }),
  );

  const durationMs = Date.now() - started;
  assertUsableStop(response.stop_reason);

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new CodedError(
      "provider",
      "El modelo no devolvió opciones con el formato esperado.",
    );
  }

  const warnings: string[] = [];
  const variants: SlotVariant[] = parsed.options.map((option) => {
    const trimmed = trimToLimits(
      input.template,
      option.slots as Record<string, string>,
    );
    warnings.push(...trimmed.warnings);
    return { angle: option.angle.trim(), slots: trimmed.slots };
  });

  const usage = readUsage(response);

  return {
    variants,
    warnings,
    usage,
    costUsd: estimateCostUsd(VARIANTS_MODEL, usage),
    durationMs,
    promptVersion: VARIANTS_PROMPT_VERSION,
  };
}

/** Instagram's own ceiling. Enforced here so a long caption is cut, not rejected. */
const CAPTION_LIMIT = 2200;

export async function generateCaptionVariants(input: {
  brand: BrandContext;
  usedAngles?: UsedAngles;
  postType: string;
  current: { caption: string; hashtags: string[]; cta: string };
  count: number;
  slideText?: string;
}): Promise<VariantsResult<CaptionVariant>> {
  const client = new Anthropic({ apiKey: apiKeyOrThrow() });
  const started = Date.now();

  const schema = z.object({
    options: z.array(
      z.object({
        angle: z.string(),
        caption: z.string(),
        cta: z.string(),
        hashtags: z.array(z.string()),
      }),
    ),
  });

  const response = await parseWithRetry(() =>
    client.messages.parse({
      model: VARIANTS_MODEL,
      max_tokens: 6000,
      system: [
        {
          type: "text",
          text: buildVariantsSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildCaptionVariantsPrompt({
            ...input.brand,
            usedAngles: input.usedAngles,
            postType: input.postType,
            current: input.current,
            count: input.count,
            slideText: input.slideText,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    }),
  );

  const durationMs = Date.now() - started;
  assertUsableStop(response.stop_reason);

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new CodedError(
      "provider",
      "El modelo no devolvió opciones con el formato esperado.",
    );
  }

  const warnings: string[] = [];
  const variants: CaptionVariant[] = parsed.options.map((option) => {
    let caption = option.caption.trim();
    if (caption.length > CAPTION_LIMIT) {
      caption = caption.slice(0, CAPTION_LIMIT).trimEnd();
      warnings.push(`Un caption superaba los ${CAPTION_LIMIT} caracteres y se recortó.`);
    }

    return {
      angle: option.angle.trim(),
      caption,
      cta: option.cta.trim(),
      // Same normalisation the batch generator applies, so a variant and an
      // original are stored identically.
      hashtags: option.hashtags
        .map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean),
    };
  });

  const usage = readUsage(response);

  return {
    variants,
    warnings,
    usage,
    costUsd: estimateCostUsd(VARIANTS_MODEL, usage),
    durationMs,
    promptVersion: VARIANTS_PROMPT_VERSION,
  };
}
