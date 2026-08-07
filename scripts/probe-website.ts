/**
 * The website import, end to end, against a real site.
 *
 * Fetch -> extract -> Claude, the same path the route takes. What the offline
 * probe cannot cover: whether a real page (minified CSS, a framework's utility
 * classes, a cookie banner) still yields colours worth using and prose worth
 * reading.
 *
 * Costs one Claude call (~US$0.01) plus one page fetch.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-website.ts <url>
 */
import { readFileSync } from "node:fs";
import { fetchSitePage } from "../lib/web/safe-fetch";
import { extractSite, toPaletteTokens } from "../lib/web/extract-brand";
import { analyzeWebsite } from "../lib/ai/analyze-website";
import { formatCostUsd } from "../lib/ai/pricing";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}

async function main() {
  loadEnv();

  const target = process.argv[2];
  if (!target) {
    console.error("Uso: probe-website.ts <url>");
    process.exitCode = 1;
    return;
  }

  console.log(`Leyendo ${target}\n`);

  const page = await fetchSitePage(target);
  console.log(`  URL final : ${page.finalUrl}`);
  console.log(`  HTML      : ${page.html.length} chars${page.truncated ? " (cortado)" : ""}`);

  const site = extractSite(page.html);
  console.log(`  Título    : ${site.meta.title ?? "—"}`);
  console.log(`  Texto     : ${site.text.length} chars`);
  console.log(`  Colores   : ${site.colors.map((c) => `${c.hex}(${c.count})`).join(" ") || "—"}`);
  console.log(`  Paleta    : ${toPaletteTokens(site.colors).map((t) => `${t.key}=${t.value}`).join(" ") || "—"}`);
  console.log(`  Fuentes   : ${site.fonts.join(", ") || "—"}`);
  console.log(`\n  Primeras palabras: ${site.text.slice(0, 240)}…\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Sin ANTHROPIC_API_KEY: sólo se probó el fetch y la extracción.");
    return;
  }

  const result = await analyzeWebsite({
    url: page.finalUrl,
    site,
    truncated: page.truncated,
  });

  const { analysis } = result;
  console.log("=== Borrador ===\n");
  console.log(`  Confianza : ${analysis.confidence}`);
  console.log(`  Tagline   : ${analysis.tagline}`);
  console.log(`\n  Tono:\n    ${analysis.tone_of_voice.replace(/\n/g, "\n    ")}`);
  console.log(`\n  Audiencia:\n    ${analysis.target_audience.replace(/\n/g, "\n    ")}`);
  console.log(`\n  Captions de ejemplo:`);
  for (const caption of analysis.example_captions) {
    console.log(`    - ${caption.replace(/\n/g, " ")}`);
  }
  console.log(`\n  Foto      : ${analysis.art_direction.photographic_style}`);
  console.log(`  Luz       : ${analysis.art_direction.lighting}`);
  console.log(`  Color     : ${analysis.art_direction.palette_notes}`);
  console.log(`  Evitar    : ${analysis.art_direction.avoid.join(" · ")}`);
  console.log(`\n  Notas     : ${analysis.notes}`);
  console.log(
    `\n  ${result.durationMs}ms · ${formatCostUsd(result.costUsd)}`,
  );
}

void main().catch((cause) => {
  console.error(`\nFalló: ${cause instanceof Error ? cause.message : cause}`);
  process.exitCode = 1;
});
