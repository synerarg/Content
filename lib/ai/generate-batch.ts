import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  TEMPLATES,
  getTemplate,
  templatesByRole,
  type AnyTemplateDefinition,
} from "@/templates/registry";
import { type FormatKey } from "@/templates/types";
import {
  BATCH_PROMPT_VERSION,
  buildBatchSystemPrompt,
  buildBatchUserPrompt,
} from "@/prompts/batch-generation";
import {
  expandRecipe,
  formatForKind,
  KIND_LABEL,
  type BatchRecipe,
  type PostKind,
} from "@/lib/batch/recipe";
import { estimateCostUsd } from "./pricing";

export const BATCH_MODEL = "claude-sonnet-5";

/*
  Same approach as the single-post call: the AI-facing schema is deliberately
  lenient about string length, because structured outputs strips
  minLength/maxLength before sending and then validates it client-side — which
  would fail an otherwise good batch over a headline three characters too long.
  Limits live in the prompt, where the model can act on them, and overflow is
  trimmed afterwards.
*/

function lenientSlots(template: AnyTemplateDefinition) {
  const shape: Record<string, z.ZodString> = {};
  for (const key of Object.keys(template.slots.shape)) {
    shape[key] = z.string();
  }
  return z.object(shape);
}

const slideVariants = TEMPLATES.map((template) =>
  z.object({
    template_slug: z.literal(template.slug),
    slots: lenientSlots(template),
  }),
);

const slideChoice = z.union(
  slideVariants as unknown as [
    (typeof slideVariants)[number],
    (typeof slideVariants)[number],
    ...(typeof slideVariants)[number][],
  ],
);

export const batchSchema = z.object({
  title: z.string(),
  posts: z
    .array(
      z.object({
        // Still asked for, even though the recipe already fixes it. It is what
        // lets a returned piece be MATCHED to a requested one — without it,
        // reconciliation could only go by position, and a model that returns
        // the right pieces in the wrong order would have its copy relabelled
        // instead of realigned.
        type: z.enum(["feed", "story", "carousel"]),
        caption: z.string(),
        hashtags: z.array(z.string()),
        cta: z.string(),
        /** Scene for the background image; carousels share one. */
        background_brief: z.string(),
        slides: z.array(slideChoice),
      }),
    )
    .min(1),
});

export type BatchOutput = z.infer<typeof batchSchema>;

export type GeneratedSlide = {
  templateSlug: string;
  slots: Record<string, string>;
};

export type GeneratedPost = {
  type: PostKind;
  format: FormatKey;
  caption: string;
  hashtags: string[];
  cta: string;
  backgroundBrief: string;
  slides: GeneratedSlide[];
};

export type GenerateBatchResult = {
  title: string;
  posts: GeneratedPost[];
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

function maxLengthOf(template: AnyTemplateDefinition, key: string): number | null {
  const field = template.slots.shape[key];
  const checks =
    (field as unknown as {
      _zod?: {
        def?: {
          checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }>;
        };
      };
    })?._zod?.def?.checks ?? [];

  for (const check of checks) {
    const def = check?._zod?.def;
    if (def?.check === "max_length" && typeof def.maximum === "number") {
      return def.maximum;
    }
  }
  return null;
}

function trimToLimits(
  template: AnyTemplateDefinition,
  slots: Record<string, string>,
  warnings: string[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, raw] of Object.entries(slots)) {
    const value = (raw ?? "").trim();
    const limit = maxLengthOf(template, key);

    if (limit !== null && value.length > limit) {
      const cut = value.slice(0, limit);
      const lastSpace = cut.lastIndexOf(" ");
      result[key] = (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
      warnings.push(`"${key}" se recortó de ${value.length} a ${limit} caracteres.`);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Enforce carousel structure after the fact rather than in the schema.
 *
 * A discriminated union could express "first slide must have role cover", but
 * only by hardcoding slug lists into the schema and losing the registry as the
 * single source of truth. Repairing here keeps the registry authoritative and
 * turns a model slip into a warning instead of a failed generation.
 */
function repairCarousel(
  slides: GeneratedSlide[],
  warnings: string[],
): GeneratedSlide[] {
  if (slides.length === 0) return slides;

  const cover = templatesByRole("cover")[0];
  const body = templatesByRole("body")[0];
  if (!cover || !body) return slides;

  return slides.map((slide, index) => {
    const template = getTemplate(slide.templateSlug);
    const wantedRole = index === 0 ? "cover" : "body";

    if (template?.role === wantedRole) return slide;

    const replacement = index === 0 ? cover : body;
    warnings.push(
      `La placa ${index + 1} del carrusel usaba "${slide.templateSlug}" (rol ${
        template?.role ?? "desconocido"
      }); se cambió a "${replacement.slug}".`,
    );

    // Carry over slot values whose names the replacement also declares.
    const carried: Record<string, string> = {};
    for (const key of Object.keys(replacement.slots.shape)) {
      carried[key] = slide.slots[key] ?? "";
    }
    // A body slide without a step number looks unfinished.
    if (replacement.role === "body" && !carried.step) {
      carried.step = String(index).padStart(2, "0");
    }

    return { templateSlug: replacement.slug, slots: carried };
  });
}

/**
 * Bring a carousel to exactly the slide count the recipe asked for.
 *
 * Extra slides are dropped. A shortfall is PADDED with an empty body slide
 * rather than accepted, because the count is an explicit request: getting the
 * requested shape with one blank to fill is closer to what was asked than
 * quietly returning a shorter carousel. Either way it warns — the point of the
 * recipe is that a mismatch stops being invisible.
 */
function fitCarouselLength(
  slides: GeneratedSlide[],
  wanted: number,
  pieceLabel: string,
  warnings: string[],
): GeneratedSlide[] {
  if (slides.length === wanted) return slides;

  if (slides.length > wanted) {
    warnings.push(
      `${pieceLabel} volvió con ${slides.length} placas en vez de ${wanted}; se descartaron las últimas ${slides.length - wanted}.`,
    );
    return slides.slice(0, wanted);
  }

  const body = templatesByRole("body")[0];
  if (!body) return slides;

  const padded = [...slides];
  while (padded.length < wanted) {
    const slots: Record<string, string> = {};
    for (const key of Object.keys(body.slots.shape)) slots[key] = "";
    slots.step = String(padded.length).padStart(2, "0");
    padded.push({ templateSlug: body.slug, slots });
  }

  warnings.push(
    `${pieceLabel} volvió con ${slides.length} placas en vez de ${wanted}; se agregaron ${wanted - slides.length} vacías para completar. Revisá el texto.`,
  );
  return padded;
}

export type RawPost = {
  type: PostKind;
  caption: string;
  hashtags: string[];
  cta: string;
  backgroundBrief: string;
  slides: GeneratedSlide[];
};

/**
 * Align what the model returned with what the recipe asked for.
 *
 * Matching is BY TYPE, greedily, not by position. A model that returns the
 * right pieces in the wrong order is common and harmless; positional matching
 * would react to it by relabelling a feed post as a carousel and mangling
 * perfectly good copy. Matching by type reorders instead.
 *
 * Unmatched requests are reported, not fabricated — copy cannot be invented
 * here, and a warning the user can act on beats an empty piece they might ship.
 */
export function reconcileWithRecipe(
  raw: RawPost[],
  recipe: BatchRecipe,
  warnings: string[],
): GeneratedPost[] {
  const wanted = expandRecipe(recipe);
  const pool = [...raw];
  const result: GeneratedPost[] = [];

  for (const [index, piece] of wanted.entries()) {
    const matchIndex = pool.findIndex((post) => post.type === piece.type);
    if (matchIndex === -1) continue;

    const [post] = pool.splice(matchIndex, 1);
    const label = `La pieza ${index + 1} (${KIND_LABEL[piece.type].toLowerCase()})`;

    let slides = post.slides;
    if (piece.type === "carousel") {
      slides = repairCarousel(slides, warnings);
      slides = fitCarouselLength(slides, piece.slides, label, warnings);
    } else if (slides.length !== 1) {
      if (slides.length === 0) continue;
      warnings.push(
        `${label} volvió con ${slides.length} placas; se usó solo la primera.`,
      );
      slides = slides.slice(0, 1);
    }

    result.push({
      type: piece.type,
      format: formatForKind(piece.type),
      caption: post.caption,
      hashtags: post.hashtags,
      cta: post.cta,
      backgroundBrief: post.backgroundBrief,
      slides,
    });
  }

  const missing = wanted.length - result.length;
  if (missing > 0) {
    warnings.push(
      `Se pidieron ${wanted.length} piezas y el modelo devolvió ${result.length}. Faltan ${missing}; generá otro lote o completalas a mano.`,
    );
  }
  if (pool.length > 0) {
    warnings.push(
      `El modelo devolvió ${pool.length} pieza(s) que no estaban en la composición pedida (${pool
        .map((post) => KIND_LABEL[post.type].toLowerCase())
        .join(", ")}); se descartaron.`,
    );
  }

  return result;
}

export async function generateBatch(input: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  recipe: BatchRecipe;
}): Promise<GenerateBatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY. Agregala a .env.local.");
  }

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await client.messages.parse({
    model: BATCH_MODEL,
    // A batch is several posts of copy plus adaptive thinking, so this needs far
    // more headroom than the single-post call.
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: buildBatchSystemPrompt(TEMPLATES),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildBatchUserPrompt(input) }],
    output_config: { format: zodOutputFormat(batchSchema) },
  });

  const durationMs = Date.now() - started;

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo rechazó el pedido. Revisá el brief.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "La respuesta se cortó por límite de tokens. Probá con una composición más chica.",
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("El modelo no devolvió un lote con el formato esperado.");
  }

  const warnings: string[] = [];

  // Normalise first, reconcile against the recipe second. Trimming and tag
  // cleanup are per-piece concerns; matching pieces to requests is a
  // whole-batch one, and doing it in that order keeps each step simple.
  const raw: RawPost[] = parsed.posts.map((post) => ({
    type: post.type,
    caption: post.caption.trim(),
    hashtags: post.hashtags
      .map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean),
    cta: post.cta.trim(),
    backgroundBrief: post.background_brief.trim(),
    slides: post.slides.map((slide) => {
      const template = getTemplate(slide.template_slug);
      const slots = slide.slots as Record<string, string>;
      return {
        templateSlug: slide.template_slug,
        slots: template ? trimToLimits(template, slots, warnings) : slots,
      };
    }),
  }));

  const posts = reconcileWithRecipe(raw, input.recipe, warnings);

  if (posts.length === 0) {
    throw new Error(
      "El modelo no devolvió ninguna pieza que coincida con la composición pedida.",
    );
  }

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    title: parsed.title.trim() || "Lote sin título",
    posts,
    warnings,
    usage,
    costUsd: estimateCostUsd(BATCH_MODEL, usage),
    durationMs,
    promptVersion: BATCH_PROMPT_VERSION,
  };
}
