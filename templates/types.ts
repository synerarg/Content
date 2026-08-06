import type { z } from "zod";

/**
 * Output formats.
 *
 * These are the real Instagram pixel dimensions, and they are the dimensions
 * the slide element is actually rendered at for export — nothing is scaled up
 * after the fact.
 */
export const FORMATS = {
  feed: { label: "Feed 4:5", width: 1080, height: 1350, aspect: "4 / 5" },
  story: { label: "Historia 9:16", width: 1080, height: 1920, aspect: "9 / 16" },
} as const;

export type FormatKey = keyof typeof FORMATS;
export type FormatSpec = (typeof FORMATS)[FormatKey];

export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

/** Resolved brand values a template renders with. */
export type BrandTokens = {
  /** Token name -> hex, e.g. { bg: "#0b0d10", primary: "#84e9ff" }. */
  palette: Record<string, string>;
  displayFamily: string;
  displayWeight: number;
  bodyFamily: string;
  bodyWeight: number;
  logoUrl: string | null;
};

/** Everything a template component receives. */
export type TemplateProps<TSlots = Record<string, string>> = {
  slots: TSlots;
  format: FormatKey;
  brand: BrandTokens;
  /** Object URL or remote URL for the background layer. Null renders flat. */
  backgroundUrl: string | null;
};

/**
 * A registered template.
 *
 * `slots` is a zod object schema and is the single source of truth for the
 * template's text fields: it drives the editor's inputs today and Claude's
 * structured output in Phase 3, so the two can never drift apart.
 */
/**
 * What slot a template fills in a post.
 *
 * `single` templates stand alone. A carousel is assembled from exactly one
 * `cover` followed by N `body` slides, which is how batch generation knows
 * what to reach for without hardcoding slugs.
 */
export type TemplateRole = "single" | "cover" | "body";

export type TemplateDefinition<
  TSchema extends z.ZodObject = z.ZodObject,
> = {
  slug: string;
  name: string;
  description: string;
  role: TemplateRole;
  formats: FormatKey[];
  slots: TSchema;
  /** Per-slot authoring guidance, surfaced in the editor and in the AI prompt. */
  slotHints: Record<string, string>;
  component: React.ComponentType<TemplateProps<z.infer<TSchema>>>;
};
