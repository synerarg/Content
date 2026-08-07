import { normalizeHex, relativeLuminance, type Rgb } from "@/lib/color";

/*
  Pulling what a Brand Kit needs out of a page's HTML.

  Split deliberately down the middle: colours, fonts and metadata are extracted
  by CODE, and only the prose goes to the model.

  A model asked to "find the brand colours" in a stylesheet reads hex codes and
  reports them, which sounds fine until it invents one, or picks the swatch from
  a cookie banner because it appeared near the word "brand". Counting
  declarations is not a judgement call — it is arithmetic, it is deterministic,
  and it is testable from a script. What the model IS good at is the part that
  is genuinely a judgement: what this company sounds like and who it talks to.

  Everything here is pure. No fetch, no DOM, no `server-only` — it takes a
  string and returns data, which is what makes scripts/verify-website.ts able to
  hold it down against fixtures.
*/

/*
  Hex and rgb() only.

  KNOWN LIMIT, worth naming rather than discovering: a site whose CSS is written
  in `oklch()` or `hsl()` — which Tailwind v4 emits, and which this very project
  uses — yields fewer colours, and a site that only ever references custom
  properties (`background: var(--surface)`) yields whatever the variable
  DECLARATIONS contain, which is usually enough but not always. Measured against
  supabase.com: the green and the neutrals came through, the true near-black
  background did not, so the draft picked the darkest colour it could see. The
  result is still a usable palette and it is still a draft for review, which is
  why this is a note and not a blocker.
*/
const HEX_IN_CSS = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB_IN_CSS = /rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/gi;

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Strip the parts of a document that are not content. */
function withoutScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
}

/** Just the CSS: <style> blocks and inline style attributes. */
function cssSources(html: string): string {
  const blocks = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
  const inline = html.match(/style\s*=\s*("[^"]*"|'[^']*')/gi) ?? [];
  return [...blocks, ...inline].join("\n");
}

export type ExtractedColor = { hex: string; count: number };

/**
 * Brand colours, ranked by how often the stylesheet declares them.
 *
 * Frequency is a blunt proxy and a good one: a colour used once is a one-off,
 * a colour used forty times is the brand. Near-identical shades are merged so a
 * design system's `--primary` and its `--primary-hover` do not eat two of the
 * five slots.
 *
 * White and black are KEPT, and dropping them as "noise every site has" was
 * wrong in a way only a live run showed: they are usually the actual background
 * and the actual text colour. Excluding them made Supabase come back as a
 * dark-green background with green body text and a neutral grey as the accent —
 * every token misassigned, from a site whose palette is unmistakable. Which
 * colour plays which ROLE is decided in toPaletteTokens, not by what gets
 * counted here.
 */
export function extractColors(html: string, limit = 8): ExtractedColor[] {
  const css = cssSources(html);
  const counts = new Map<string, number>();

  const add = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };

  for (const match of css.matchAll(HEX_IN_CSS)) add(match[0]);
  for (const match of css.matchAll(RGB_IN_CSS)) {
    const rgb: Rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (rgb.some((channel) => channel > 255)) continue;
    add(toHex(rgb));
  }

  const ranked = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));

  // Merge shades that are visually the same. The winner keeps the combined
  // count so the ranking still reflects total usage.
  const merged: ExtractedColor[] = [];
  for (const candidate of ranked) {
    const rgb = hexToRgb(candidate.hex);
    if (!rgb) continue;

    const near = merged.find((existing) => {
      const existingRgb = hexToRgb(existing.hex);
      return existingRgb !== null && colorDistance(rgb, existingRgb) < 28;
    });

    if (near) near.count += candidate.count;
    else merged.push({ ...candidate });
  }

  return merged.slice(0, limit);
}

/** How far a colour sits from the grey axis. 0 is a neutral, 255 is fully saturated. */
function chroma(rgb: Rgb): number {
  return Math.max(...rgb) - Math.min(...rgb);
}

/** Below this a colour is a neutral, and a neutral is never a brand accent. */
const ACCENT_MIN_CHROMA = 30;

/**
 * Split extracted colours into the tokens the render path requires.
 *
 * `bg` and `fg` are REQUIRED by the palette schema and every template falls
 * back to them, so they are assigned here rather than left to whatever the site
 * declared most.
 *
 * Each role is picked by the MOST-USED colour in its band, not by the extreme.
 * The extreme is usually an outlier — one inverted footer makes pure black the
 * darkest colour on an otherwise near-black site — while the most-used dark is
 * the background the site actually renders on.
 *
 * The accent is the most-used colour with real chroma. Restricting it that way
 * is what stops a neutral grey winning on a site that declares grey borders
 * forty times, which is exactly what happened to Supabase before this: its
 * unmistakable green lost to `#a0a0a0`.
 */
export function toPaletteTokens(
  colors: ExtractedColor[],
): Array<{ key: string; value: string }> {
  const withLuminance = colors
    .map((color) => {
      const rgb = hexToRgb(color.hex);
      return rgb
        ? { ...color, luminance: relativeLuminance(rgb), chroma: chroma(rgb) }
        : null;
    })
    .filter(
      (color): color is ExtractedColor & { luminance: number; chroma: number } =>
        color !== null,
    );

  if (withLuminance.length === 0) return [];

  /*
    The bands are narrow on purpose.

    A generous "dark" band swallows mid-tones: a brand green like #4a5d23 sits
    at luminance 0.09, so a 0.15 cutoff made it the BACKGROUND and left the
    palette with no accent. A colour a site actually renders pages on is far
    darker than that, or far lighter. Input is already ranked by usage, so the
    first match in each band is the most-used one in it.
  */
  const darks = withLuminance.filter((color) => color.luminance < 0.05);
  const lights = withLuminance.filter((color) => color.luminance > 0.6);

  const byLuminance = [...withLuminance].sort((a, b) => a.luminance - b.luminance);
  const bg = darks[0] ?? byLuminance[0];
  const fg = lights[0] ?? byLuminance[byLuminance.length - 1];

  const tokens: Array<{ key: string; value: string }> = [];

  /*
    Only trust the site for bg/fg when the two are genuinely far apart.

    A site built entirely in mid-greys would otherwise hand the render path a
    background and a foreground that are almost the same colour, and every piece
    would come out unreadable before anyone had edited anything.
  */
  const spread = Math.abs(fg.luminance - bg.luminance);
  const trustworthy = spread > 0.25;

  tokens.push({ key: "bg", value: trustworthy ? bg.hex : "#0b0d10" });
  tokens.push({ key: "fg", value: trustworthy ? fg.hex : "#f5f7fa" });

  const accent =
    withLuminance.find(
      (color) =>
        color.chroma >= ACCENT_MIN_CHROMA &&
        color.hex !== tokens[0].value &&
        color.hex !== tokens[1].value,
    ) ??
    // A genuinely monochrome brand: fall back to any remaining colour rather
    // than leaving the piece with no accent at all.
    withLuminance.find(
      (color) => color.hex !== tokens[0].value && color.hex !== tokens[1].value,
    );

  if (accent) {
    tokens.push({ key: "primary", value: accent.hex });
    // A readable colour to put ON the accent, decided by luminance rather than
    // guessed: this is the token every template uses for pill text.
    tokens.push({
      key: "on-primary",
      value: accent.luminance > 0.4 ? "#0b0d10" : "#ffffff",
    });
  }

  return tokens;
}

/** Font families a page declares, most-used first. Generic families are dropped. */
const GENERIC_FAMILIES = new Set([
  "inherit",
  "initial",
  "unset",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "roboto",
  "helvetica neue",
  "helvetica",
  "arial",
]);

export function extractFontFamilies(html: string, limit = 4): string[] {
  const css = cssSources(html);
  const counts = new Map<string, number>();

  // `[^;}]`, not `[^;}"']`: excluding the quote characters means the class
  // cannot match the OPENING quote of `font-family: "Fraunces", Georgia`, so
  // the capture came back empty and no quoted family was ever found — which is
  // most of them. The quotes are stripped from the captured name instead.
  for (const match of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    // Only the FIRST family in the stack: the rest are fallbacks, and counting
    // them would rank "Arial" above whatever the site actually uses.
    const first = match[1].split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!first) continue;

    const key = first.toLowerCase();
    if (GENERIC_FAMILIES.has(key) || key.startsWith("var(")) continue;
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([family]) => family);
}

/*
  Named entities worth decoding.

  Not a full HTML entity table — a Spanish-language site uses a couple of dozen
  of them and the rest are noise. The accented ones are the point: a page that
  writes "Maip&uacute;" instead of "Maipú" would otherwise reach the model as
  "Maip&uacute;", and a model reading mangled Spanish writes a tone of voice
  based on mangled Spanish.
*/
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  iquest: "¿",
  iexcl: "¡",
  ordf: "ª",
  ordm: "º",
  deg: "°",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(value: string): string {
  return (
    value
      // Numeric forms first, decimal and hex, so `&#233;` and `&#xE9;` both work.
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      // Named ones are case-SENSITIVE: &Aacute; and &aacute; are different
      // characters, and a case-insensitive match would lowercase proper nouns.
      .replace(/&([a-zA-Z]+);/g, (whole, name: string) => {
        if (name in NAMED_ENTITIES) return NAMED_ENTITIES[name];
        const lower = name.toLowerCase();
        return lower in NAMED_ENTITIES ? NAMED_ENTITIES[lower] : whole;
      })
  );
}

function metaContent(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match ? decodeEntities(match[1]).trim() : null;
}

export type SiteMeta = {
  title: string | null;
  description: string | null;
  siteName: string | null;
};

export function extractMeta(html: string): SiteMeta {
  return {
    title: metaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description:
      metaContent(
        html,
        /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i,
      ) ??
      metaContent(
        html,
        /<meta[^>]+property\s*=\s*["']og:description["'][^>]+content\s*=\s*["']([^"']*)["']/i,
      ),
    siteName: metaContent(
      html,
      /<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']*)["']/i,
    ),
  };
}

/**
 * The readable prose, capped.
 *
 * Everything past the cap is navigation, footers and cookie notices — the parts
 * of a site that say nothing about how the company talks. Capping also keeps
 * the model call small and cheap.
 */
export function extractText(html: string, limit = 12_000): string {
  const text = withoutScripts(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  return decodeEntities(text).trim().slice(0, limit);
}

export type ExtractedSite = {
  meta: SiteMeta;
  colors: ExtractedColor[];
  fonts: string[];
  text: string;
};

export function extractSite(html: string): ExtractedSite {
  return {
    meta: extractMeta(html),
    colors: extractColors(html),
    fonts: extractFontFamilies(html),
    text: extractText(html),
  };
}
