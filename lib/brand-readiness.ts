import { artDirectionSchema, recordToPalette, typographySchema } from "@/lib/schemas/brand";

/*
  Is this brand complete enough to spend money generating with it?

  Checked BEFORE any AI call, not after. A brand with no art direction produces
  a generic background, a brand with no fonts renders the export in a system
  typeface — both cost a real call and both are discovered only once the result
  is on screen. Blocking up front with a link to the missing field is the
  cheapest possible failure.

  Deliberately NOT a zod schema: the brand row is already valid by the time it
  is stored. This asks a different question — not "is this well-formed" but "is
  there enough here to be worth paying for" — and it answers with a list a
  person can act on.
*/

export type BrandGap = {
  /** What is missing, phrased as the thing to go and do. */
  label: string;
  /** Anchor on the brand form, so the link lands on the right section. */
  field: string;
};

export type BrandReadiness = {
  ready: boolean;
  gaps: BrandGap[];
};

export function checkBrandReadiness(brand: {
  palette: unknown;
  typography: unknown;
  art_direction: unknown;
}): BrandReadiness {
  const gaps: BrandGap[] = [];

  // At least one colour beyond nothing. recordToPalette already filters out
  // malformed entries, so an empty result means there is genuinely no palette.
  if (recordToPalette(brand.palette).length === 0) {
    gaps.push({ label: "la paleta de colores", field: "palette" });
  }

  const typography = typographySchema.safeParse(brand.typography);
  if (!typography.success || !typography.data.display.family.trim()) {
    gaps.push({ label: "las tipografías", field: "typography" });
  }

  /*
    Art direction counts as present only if the photographic style is written.
    The other fields (lighting, palette notes, avoid) genuinely improve the
    result but a background can be composed without them; without a style the
    image prompt has nothing brand-specific to say at all.
  */
  const artDirection = artDirectionSchema.safeParse(brand.art_direction);
  if (!artDirection.success || !artDirection.data.photographic_style.trim()) {
    gaps.push({ label: "la dirección de arte", field: "art_direction" });
  }

  return { ready: gaps.length === 0, gaps };
}

/** "Falta la dirección de arte" / "Faltan la paleta y las tipografías" */
export function describeGaps(gaps: BrandGap[]): string {
  if (gaps.length === 0) return "";
  const labels = gaps.map((gap) => gap.label);
  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
  return `${gaps.length === 1 ? "Falta" : "Faltan"} ${joined}`;
}
