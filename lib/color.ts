/**
 * WCAG 2.1 contrast utilities.
 *
 * These exist so the Brand Kit editor can tell a user that their foreground on
 * their background is unreadable *while they are choosing it*, rather than
 * letting the problem surface as a low-contrast exported post. Weak contrast is
 * one of the specific failure modes this product was built to eliminate.
 */

export const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHex(input: string): string | null {
  const value = input.trim();
  if (!HEX_COLOR_RE.test(value)) return null;

  const hex = value.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;

  return `#${full.toLowerCase()}`;
}

function toRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

/** Relative luminance per WCAG 2.1, on the sRGB channels. */
function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colors, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = toRgb(foreground);
  const bg = toRgb(background);
  if (!fg || !bg) return null;

  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));

  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastGrade = "AAA" | "AA" | "AA Large" | "Insuficiente";

/**
 * Grade a ratio for on-image display text.
 *
 * Thresholds are the WCAG ones (7 / 4.5 / 3). Social post headlines are large
 * text, so "AA Large" is genuinely passing for a headline — but it is called
 * out separately because the same pair on body copy would not be.
 */
export function contrastGrade(ratio: number): ContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Insuficiente";
}
