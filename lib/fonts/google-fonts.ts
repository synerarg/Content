/**
 * Curated Google Fonts list for Brand Kits.
 *
 * Deliberately not the full ~1,700-family catalogue. Every family here is
 * chosen for social-post typography: strong at display sizes, wide weight
 * range, and complete Latin coverage for Rioplatense Spanish (including the
 * accented vowels and ñ that some display faces omit).
 *
 * Narrowing the list is a design decision, not a technical limitation — it
 * keeps a non-designer from picking a face that falls apart at 1080px.
 */

export type GoogleFontFamily = {
  family: string;
  weights: number[];
  category: "sans" | "serif" | "display";
};

export const GOOGLE_FONTS: GoogleFontFamily[] = [
  { family: "Poppins", weights: [300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Inter", weights: [300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Montserrat", weights: [300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "DM Sans", weights: [400, 500, 700], category: "sans" },
  { family: "Manrope", weights: [400, 500, 600, 700, 800], category: "sans" },
  { family: "Work Sans", weights: [300, 400, 500, 600, 700], category: "sans" },
  { family: "Space Grotesk", weights: [400, 500, 600, 700], category: "sans" },
  { family: "Outfit", weights: [300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Sora", weights: [400, 500, 600, 700, 800], category: "sans" },
  { family: "Archivo", weights: [400, 500, 600, 700, 800], category: "sans" },
  { family: "Rubik", weights: [400, 500, 600, 700], category: "sans" },
  { family: "Raleway", weights: [400, 500, 600, 700, 800], category: "sans" },
  { family: "Nunito", weights: [400, 600, 700, 800], category: "sans" },
  { family: "Josefin Sans", weights: [300, 400, 600, 700], category: "sans" },

  { family: "Playfair Display", weights: [400, 500, 600, 700, 800], category: "serif" },
  { family: "Lora", weights: [400, 500, 600, 700], category: "serif" },
  { family: "Merriweather", weights: [300, 400, 700, 900], category: "serif" },
  { family: "Libre Baskerville", weights: [400, 700], category: "serif" },
  { family: "Source Serif 4", weights: [400, 600, 700], category: "serif" },
  { family: "Cormorant Garamond", weights: [400, 500, 600, 700], category: "serif" },
  { family: "Fraunces", weights: [400, 500, 600, 700, 900], category: "serif" },

  { family: "Bebas Neue", weights: [400], category: "display" },
  { family: "Oswald", weights: [400, 500, 600, 700], category: "display" },
  { family: "Syne", weights: [400, 500, 600, 700, 800], category: "display" },
  { family: "DM Serif Display", weights: [400], category: "display" },
  { family: "Instrument Serif", weights: [400], category: "display" },
];

export const GOOGLE_FONT_MAP = new Map(
  GOOGLE_FONTS.map((font) => [font.family, font]),
);

export function weightsFor(family: string): number[] {
  return GOOGLE_FONT_MAP.get(family)?.weights ?? [400, 700];
}
