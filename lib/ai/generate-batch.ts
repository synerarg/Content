import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  PRODUCT_TEMPLATES,
  TEMPLATES,
  getTemplate,
  requiredSlots,
  templatesByRole,
  type AnyTemplateDefinition,
} from "@/templates/registry";
import { type FormatKey } from "@/templates/types";
import {
  BATCH_PROMPT_VERSION,
  buildBatchSystemPrompt,
  buildBatchUserPrompt,
  type BatchProduct,
  type UsedAngles,
} from "@/prompts/batch-generation";
import {
  expandRecipe,
  formatForKind,
  KIND_LABEL,
  type BatchRecipe,
  type PostKind,
} from "@/lib/batch/recipe";
import { CodedError } from "@/lib/errors";
import { parseWithRetry } from "./parse-with-retry";
import { trimToLimits } from "./slot-limits";
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

/*
  ONE object with every slot name in the catalogue, not a union per template.

  It was a discriminated union — one variant per template, each carrying that
  template's exact slot names — and that union was what guaranteed at the schema
  level that a `quote` could not land in a `bold-headline`. It had a ceiling
  nobody had measured. Anthropic compiles the output schema to a grammar and
  rejects one that grows too large, and measured 2026-08-07 the eleventh
  template crossed it:

    10 plantillas -> esquema 4412 car. -> OK
    11 plantillas -> esquema 5117 car. -> 400 "compiled grammar is too large"

  The failure takes the WHOLE batch, not one piece, and it arrived the moment
  four templates were added — so the shape was one template away from breaking
  for anyone who added one.

  The first replacement was `slots: z.record(z.string(), z.string())`. It
  compiled and it was WORSE: every slide came back `"slots": {}`. A batch that
  looks complete — caption, hashtags, CTA all present — with every slide blank
  is a far more expensive failure than a 400, because nothing announces it.
  Recorded here so nobody tries it again.

  What works, and is measured: a single object holding the UNION OF SLOT NAMES
  across all templates, every one a plain string. 31 keys today, 2402
  characters — smaller than the original ten-template union — and it grows only
  when a template introduces a slot NAME nobody else uses, not with every
  template added. Verified live: asked for `bold-headline`, the model filled
  headline/subline/cta and left the other 28 empty.

  What it gives up is the schema-level guarantee about which slots belong to
  which template. Not given up for nothing: the prompt already describes every
  template's slots with hints and character limits, it now says explicitly to
  leave the rest empty, and `alignSlots` below drops anything the template does
  not declare and warns when a required slot came back blank. Same philosophy as
  `repairCarousel` — a model slip becomes a visible warning rather than a crash
  or a silent wrong render.
*/
const TEMPLATE_SLUGS = TEMPLATES.map((template) => template.slug) as [
  string,
  ...string[],
];

export const ALL_SLOT_KEYS = [
  ...new Set(TEMPLATES.flatMap((template) => Object.keys(template.slots.shape))),
].sort();

function allSlotsSchema() {
  const shape: Record<string, z.ZodString> = {};
  for (const key of ALL_SLOT_KEYS) shape[key] = z.string();
  return z.object(shape);
}

const slideChoice = z.object({
  template_slug: z.enum(TEMPLATE_SLUGS),
  slots: allSlotsSchema(),
});

/**
 * Keep only the slots this template declares, and say what was wrong.
 *
 * Unknown keys are dropped rather than carried: a value under a key no
 * component reads is invisible, and leaving it in the record would make the
 * piece look complete to anything counting fields. A required slot that came
 * back empty is warned about but not invented — the export gate already refuses
 * to rasterize it, and a fabricated headline is worse than a visible gap.
 */
function alignSlots(
  template: AnyTemplateDefinition,
  slots: Record<string, string>,
  pieceLabel: string,
  warnings: string[],
): Record<string, string> {
  const declared = Object.keys(template.slots.shape);
  const aligned: Record<string, string> = {};
  for (const key of declared) aligned[key] = slots[key] ?? "";

  /*
    Only keys that came back WITH TEXT are worth reporting.

    Every slide now carries all 31 slot names by construction, so ~28 of them
    are empty and expected. Warning about those would bury the one warning that
    means something — the model wrote a `quote` into a template that has no
    place to put it — under a wall of noise, which is how warnings stop
    being read.
  */
  const unknown = Object.keys(slots).filter(
    (key) => !declared.includes(key) && (slots[key] ?? "").trim().length > 0,
  );
  if (unknown.length > 0) {
    warnings.push(
      `${pieceLabel}: la plantilla "${template.slug}" no tiene ${unknown
        .map((key) => `"${key}"`)
        .join(", ")}; se descartaron.`,
    );
  }

  const emptyRequired = requiredSlots(template).filter(
    (key) => aligned[key].trim().length === 0,
  );
  if (emptyRequired.length > 0) {
    warnings.push(
      `${pieceLabel}: quedó sin ${emptyRequired
        .map((key) => `"${key}"`)
        .join(", ")} en "${template.slug}". Completalo antes de exportar.`,
    );
  }

  return aligned;
}

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
        slides: z.array(slideChoice),
        /*
          LAST, and the position is the point.

          A structured output is emitted in schema order, so this field used to
          be written BEFORE the slides — the model chose the photograph before
          it knew what the headline said, and could not tie one to the other
          even if the prompt asked it to. Which the prompt now does; see
          BATCH_PROMPT_VERSION 2026-08-07.2. Moving it after `slides` is half of
          that change and costs nothing.

          Scene for the background image; a carousel's slides share one.
        */
        background_brief: z.string(),
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
  /** Captions already published by this brand, newest first. */
  publishedHistory?: string[];
  /** Named angles/hooks to forbid, from analyzePublishedHistory(). */
  usedAngles?: UsedAngles;
  /** The product this batch is about, if it has one. */
  product?: BatchProduct;
}): Promise<GenerateBatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CodedError("config", "Falta ANTHROPIC_API_KEY. Agregala a .env.local.");
  }

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await parseWithRetry(() =>
    client.messages.parse({
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
      messages: [
        {
          role: "user",
          content: buildBatchUserPrompt({
            ...input,
            // Read off the registry, so a new product template is taught to the
            // prompt by existing rather than by an edit here.
            productTemplateSlugs: PRODUCT_TEMPLATES.map((t) => t.slug),
          }),
        },
      ],
      output_config: { format: zodOutputFormat(batchSchema) },
    }),
  );

  const durationMs = Date.now() - started;

  if (response.stop_reason === "refusal") {
    throw new CodedError("safety", "El modelo rechazó el pedido. Revisá el brief.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new CodedError(
      "too_long",
      "La respuesta se cortó por límite de tokens. Probá con una composición más chica.",
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new CodedError(
      "provider",
      "El modelo no devolvió un lote con el formato esperado.",
    );
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
    slides: post.slides.map((slide, index) => {
      const template = getTemplate(slide.template_slug);
      const slots = slide.slots as Record<string, string>;
      if (!template) return { templateSlug: slide.template_slug, slots };

      // Align BEFORE trimming: trimming iterates the keys it is given, so a
      // stray one would otherwise be measured, reported and carried along.
      const label = `${KIND_LABEL[post.type]} · placa ${index + 1}`;
      const aligned = alignSlots(template, slots, label, warnings);
      const trimmed = trimToLimits(template, aligned);
      warnings.push(...trimmed.warnings);
      return { templateSlug: slide.template_slug, slots: trimmed.slots };
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
