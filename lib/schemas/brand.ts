import { z } from "zod";
import { HEX_COLOR_RE, normalizeHex } from "@/lib/color";

/*
  One schema, two consumers: the Brand Kit form validates against it in the
  browser, and the server actions re-validate against it before touching the
  database. Client-side validation is a convenience; the server copy is the
  actual guarantee.
*/

const TOKEN_KEY_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Tokens the render path is allowed to assume exist.
 *
 * Templates compute contrast and fall back to `bg`/`fg` when a slot has no
 * explicit color, so a brand without them would render unpredictably. Requiring
 * them here means template code never has to defend against a missing token.
 */
export const REQUIRED_TOKENS = ["bg", "fg"] as const;

/**
 * Display order for the palette editor and brand cards.
 *
 * Postgres `jsonb` does not preserve object key order, so ordering cannot be a
 * stored property. Making it a canonical, code-owned list is better than
 * storing an array anyway: templates address tokens by NAME (`palette.primary`),
 * never by index, and brands stay visually comparable to each other.
 */
export const CANONICAL_TOKEN_ORDER = [
  "bg",
  "surface",
  "fg",
  "muted",
  "primary",
  "on-primary",
  "accent",
] as const;

export const colorTokenSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "El token necesita un nombre.")
    .max(40)
    .regex(TOKEN_KEY_RE, "Usá minúsculas, números y guiones (ej. on-primary)."),
  value: z
    .string()
    .trim()
    .regex(HEX_COLOR_RE, "Tiene que ser un hex válido (ej. #84E9FF)."),
});

export type ColorToken = z.infer<typeof colorTokenSchema>;

export const paletteSchema = z
  .array(colorTokenSchema)
  .min(1, "Definí al menos un color.")
  .max(24, "Máximo 24 tokens de color.")
  .superRefine((tokens, ctx) => {
    const seen = new Map<string, number>();

    tokens.forEach((token, index) => {
      const key = token.key.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `El token "${key}" está duplicado.`,
          path: [index, "key"],
        });
      }
      seen.set(key, index);
    });

    for (const required of REQUIRED_TOKENS) {
      if (!seen.has(required)) {
        ctx.addIssue({
          code: "custom",
          message: `Falta el token obligatorio "${required}".`,
        });
      }
    }
  });

export const typographyRoleSchema = z.object({
  family: z.string().trim().min(1, "Elegí una tipografía.").max(120),
  // Plain z.number(), not z.coerce.number(): coerce types its input as
  // `unknown`, which reintroduces the input/output divergence this file
  // deliberately avoids. The picker always supplies a real number.
  weight: z.number().int().min(100).max(900),
  source: z.enum(["google", "upload"]),
});

export const typographySchema = z.object({
  display: typographyRoleSchema,
  body: typographyRoleSchema,
});

/*
  No `.default()` anywhere below.

  A zod default makes the field optional on the INPUT type while required on the
  OUTPUT type, so `z.infer` and the resolver's expected shape diverge and
  react-hook-form's generics need casting to compile. Since the form always
  supplies every field (see defaultBrandFormValues), keeping them required makes
  input and output identical — and an empty string is a perfectly good "unset".
*/
export const artDirectionSchema = z.object({
  photographic_style: z.string().trim().max(2000),
  lighting: z.string().trim().max(1000),
  palette_notes: z.string().trim().max(1000),
  /** Fed verbatim into the image model's negative prompt in Phase 4. */
  avoid: z.array(z.string().trim().min(1).max(120)).max(30),
});

export const brandFormSchema = z.object({
  name: z.string().trim().min(1, "La marca necesita un nombre.").max(120),
  tagline: z.string().trim().max(200),
  logo_path: z.string().trim().max(500).nullable(),
  palette: paletteSchema,
  typography: typographySchema,
  tone_of_voice: z.string().trim().max(4000),
  target_audience: z.string().trim().max(2000),
  example_captions: z.array(z.string().trim().max(2200)).max(10),
  art_direction: artDirectionSchema,
});

export type BrandFormValues = z.infer<typeof brandFormSchema>;

// ---------------------------------------------------------------------------
// Palette <-> storage
// ---------------------------------------------------------------------------

/** Editor array -> jsonb object, with hex values normalized to 6-digit lowercase. */
export function paletteToRecord(tokens: ColorToken[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const token of tokens) {
    record[token.key.toLowerCase()] = normalizeHex(token.value) ?? token.value;
  }
  return record;
}

/** jsonb object -> editor array, ordered canonically then alphabetically. */
export function recordToPalette(record: unknown): ColorToken[] {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return [];
  }

  const entries = Object.entries(record as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  const rank = (key: string) => {
    const index = CANONICAL_TOKEN_ORDER.indexOf(
      key as (typeof CANONICAL_TOKEN_ORDER)[number],
    );
    return index === -1 ? CANONICAL_TOKEN_ORDER.length : index;
  };

  return entries
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
}

/** Sensible starting palette for a new brand — every required token present. */
export function defaultPalette(): ColorToken[] {
  return [
    { key: "bg", value: "#0b0d10" },
    { key: "fg", value: "#f5f7fa" },
    { key: "primary", value: "#84e9ff" },
    { key: "on-primary", value: "#0b0d10" },
  ];
}

/**
 * Database row -> form values.
 *
 * The jsonb columns are `unknown` as far as TypeScript is concerned, and a row
 * written by an older schema version may not match today's shape. Each section
 * is parsed independently and falls back to its default, so one stale field
 * cannot make an otherwise-editable brand unopenable.
 */
export function brandRowToFormValues(row: {
  name: string;
  tagline: string | null;
  logo_path: string | null;
  palette: unknown;
  typography: unknown;
  tone_of_voice: string | null;
  target_audience: string | null;
  example_captions: string[] | null;
  art_direction: unknown;
}): BrandFormValues {
  const fallback = defaultBrandFormValues();

  const typography = typographySchema.safeParse(row.typography);
  const artDirection = artDirectionSchema.safeParse(row.art_direction);
  const palette = recordToPalette(row.palette);

  return {
    name: row.name,
    tagline: row.tagline ?? "",
    logo_path: row.logo_path,
    palette: palette.length > 0 ? palette : fallback.palette,
    typography: typography.success ? typography.data : fallback.typography,
    tone_of_voice: row.tone_of_voice ?? "",
    target_audience: row.target_audience ?? "",
    example_captions: row.example_captions ?? [],
    art_direction: artDirection.success ? artDirection.data : fallback.art_direction,
  };
}

export function defaultBrandFormValues(): BrandFormValues {
  return {
    name: "",
    tagline: "",
    logo_path: null,
    palette: defaultPalette(),
    typography: {
      display: { family: "Poppins", weight: 700, source: "google" },
      body: { family: "Poppins", weight: 400, source: "google" },
    },
    tone_of_voice: "",
    target_audience: "",
    example_captions: [],
    art_direction: {
      photographic_style: "",
      lighting: "",
      palette_notes: "",
      avoid: [],
    },
  };
}
