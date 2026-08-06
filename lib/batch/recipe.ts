import { z } from "zod";

/*
  A batch recipe: the exact composition to produce, rather than a count.

  This replaces `postCount: 3`, which could only say "three pieces, you pick the
  mix". An agency planning a week does not think that way — it thinks "a
  four-slide carousel, one feed post and three stories". Saying so explicitly
  buys two things beyond convenience:

    1. The prompt asks for a structure instead of a number, so the model has far
       less to invent.
    2. The result becomes CHECKABLE. Ask for 5 pieces today and get 4, and
       nothing notices; a recipe gives the code something to compare against, so
       a short batch surfaces as a warning instead of passing silently.

  Deliberately free of `server-only`: the create panel builds a recipe in the
  browser, the route validates it, and the prompt renders it. One shape, three
  consumers.
*/

export const POST_KINDS = ["feed", "story", "carousel"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** Carousels need at least a cover and one body slide to be a carousel at all. */
export const CAROUSEL_SLIDE_RANGE = { min: 2, max: 8 } as const;

/*
  Ceilings on the whole recipe.

  Both exist because the batch is ONE structured-output call with
  max_tokens 16000 — the copy for every piece comes back together. Past roughly
  this size the response starts getting truncated, which surfaces as
  `stop_reason: "max_tokens"` and loses the entire batch rather than degrading.
  Better to refuse up front with a number the user can act on.
*/
export const RECIPE_LIMITS = { maxPosts: 10, maxSlides: 16 } as const;

export const recipeItemSchema = z.object({
  type: z.enum(POST_KINDS),
  count: z.number().int().min(1).max(RECIPE_LIMITS.maxPosts),
  /** Slides per piece. Only carousels use anything but 1. */
  slides: z
    .number()
    .int()
    .min(1)
    .max(CAROUSEL_SLIDE_RANGE.max),
});

export type RecipeItem = z.infer<typeof recipeItemSchema>;
export type BatchRecipe = RecipeItem[];

export const recipeSchema = z
  .array(recipeItemSchema)
  .min(1, "Elegí al menos una pieza.")
  .superRefine((items, ctx) => {
    const posts = totalPosts(items);
    const slides = totalSlides(items);

    if (posts > RECIPE_LIMITS.maxPosts) {
      ctx.addIssue({
        code: "custom",
        message: `Máximo ${RECIPE_LIMITS.maxPosts} piezas por lote (pediste ${posts}).`,
      });
    }
    if (slides > RECIPE_LIMITS.maxSlides) {
      ctx.addIssue({
        code: "custom",
        message: `Máximo ${RECIPE_LIMITS.maxSlides} placas por lote (pediste ${slides}).`,
      });
    }

    for (const item of items) {
      if (item.type === "carousel" && item.slides < CAROUSEL_SLIDE_RANGE.min) {
        ctx.addIssue({
          code: "custom",
          message: `Un carrusel necesita al menos ${CAROUSEL_SLIDE_RANGE.min} placas.`,
        });
      }
      if (item.type !== "carousel" && item.slides !== 1) {
        ctx.addIssue({
          code: "custom",
          message: `Una pieza de tipo ${item.type} tiene exactamente una placa.`,
        });
      }
    }
  });

export const KIND_LABEL: Record<PostKind, string> = {
  feed: "Feed",
  story: "Historia",
  carousel: "Carrusel",
};

/** Plural form, for counts. "3 historias" reads better than "3 Historia". */
export const KIND_LABEL_PLURAL: Record<PostKind, string> = {
  feed: "feeds",
  story: "historias",
  carousel: "carruseles",
};

export function totalPosts(recipe: BatchRecipe): number {
  return recipe.reduce((sum, item) => sum + item.count, 0);
}

export function totalSlides(recipe: BatchRecipe): number {
  return recipe.reduce((sum, item) => sum + item.count * item.slides, 0);
}

/** "1 carrusel de 4 placas · 1 feed · 3 historias" */
export function describeRecipe(recipe: BatchRecipe): string {
  return recipe
    .filter((item) => item.count > 0)
    .map((item) => {
      const label =
        item.count === 1 ? KIND_LABEL[item.type].toLowerCase() : KIND_LABEL_PLURAL[item.type];
      const slides =
        item.type === "carousel" ? ` de ${item.slides} placas` : "";
      return `${item.count} ${label}${slides}`;
    })
    .join(" · ");
}

/**
 * Flatten a recipe into the per-piece plan the generator and the verifier both
 * work from — one entry per piece, in the order they should appear.
 */
export function expandRecipe(
  recipe: BatchRecipe,
): Array<{ type: PostKind; slides: number }> {
  return recipe.flatMap((item) =>
    Array.from({ length: item.count }, () => ({
      type: item.type,
      slides: item.type === "carousel" ? item.slides : 1,
    })),
  );
}

export type RecipePreset = {
  id: string;
  label: string;
  description: string;
  recipe: BatchRecipe;
};

export const RECIPE_PRESETS: RecipePreset[] = [
  {
    id: "semana",
    label: "Semana completa",
    description: "Un carrusel que desarrolla el tema, un feed y tres historias.",
    recipe: [
      { type: "carousel", count: 1, slides: 4 },
      { type: "feed", count: 1, slides: 1 },
      { type: "story", count: 3, slides: 1 },
    ],
  },
  {
    id: "carrusel",
    label: "Un carrusel",
    description: "Una sola pieza, desarrollada en cinco placas.",
    recipe: [{ type: "carousel", count: 1, slides: 5 }],
  },
  {
    id: "historias",
    label: "Solo historias",
    description: "Cinco historias sueltas sobre el mismo tema.",
    recipe: [{ type: "story", count: 5, slides: 1 }],
  },
];

/** Starting point for the custom builder: one of each, nothing exotic. */
export function defaultCustomRecipe(): BatchRecipe {
  return [
    { type: "carousel", count: 1, slides: 4 },
    { type: "feed", count: 1, slides: 1 },
    { type: "story", count: 1, slides: 1 },
  ];
}

/**
 * Format is a consequence of the piece type, never an independent choice.
 *
 * Previously the model returned a `format` alongside `type`, which let a feed
 * post come back in story dimensions. There is exactly one right answer per
 * type, so it is derived rather than asked for.
 */
export function formatForKind(type: PostKind): "feed" | "story" {
  return type === "story" ? "story" : "feed";
}
