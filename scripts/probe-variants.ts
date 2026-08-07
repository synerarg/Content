/**
 * Variants, against the live API.
 *
 * The one question worth spending a call on: are the options actually
 * DIFFERENT, or three rephrasings of the same argument? Three near-identical
 * options are worse than none — they look like a choice and cost the reader the
 * time to find out they aren't one.
 *
 * The mechanical checks below can only catch the crude failure (identical
 * headlines, repeated angle labels). HANDOFF §10 already records that a
 * keyword-collision metric was useless for the history work and that a real
 * check needs semantic similarity. So this ALSO prints every option: the
 * headlines are meant to be read, and the judgement recorded honestly.
 *
 * Costs two calls (~US$0.01).
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-variants.ts
 */
import { readFileSync } from "node:fs";
import { getTemplate } from "../templates/registry";
import {
  generateCaptionVariants,
  generateSlotVariants,
} from "../lib/ai/generate-variants";
import { maxLengthOf } from "../lib/ai/slot-limits";
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

let failures = 0;
let checks = 0;

function assert(label: string, condition: boolean, detail = "") {
  checks++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${condition || !detail ? "" : ` — ${detail}`}`);
  if (!condition) failures++;
}

const BRAND = {
  brandName: "Synera",
  toneOfVoice:
    "Rioplatense, directo, sin vender humo. Voseo siempre. Habla de plata y de tiempo, no de tecnología.",
  targetAudience:
    "Dueños de pymes argentinas de 5 a 40 empleados que todavía manejan el negocio con planillas.",
  exampleCaptions: [
    "Si tenés que abrir tres planillas para saber cuánto facturaste, no tenés un sistema: tenés un problema.",
    "Nadie pierde un cliente de golpe. Se pierde en un mail que quedó sin responder.",
  ],
};

/** Cheap, honest overlap: how many words two headlines share. */
function wordOverlap(a: string, b: string): number {
  const words = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^\wáéíóúñü\s]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 3),
    );
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size);
}

async function main() {
  loadEnv();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY en .env.local");
    process.exitCode = 1;
    return;
  }

  const template = getTemplate("bold-headline");
  if (!template) throw new Error("Falta la plantilla bold-headline");

  // ---------------------------------------------------------------------
  console.log("\n=== Slot variants ===\n");

  const current = {
    headline: "Tu competencia ya tiene un sistema y vos seguís con planillas",
    subline: "Cada semana que pasa, la diferencia se agranda.",
    cta: "Ver cómo",
  };

  console.log("Pieza actual:");
  console.log(`  ${current.headline}\n`);

  const slotResult = await generateSlotVariants({
    brand: BRAND,
    template,
    format: "feed",
    current,
    count: 3,
    sceneBrief: "un depósito de repuestos a media mañana, con cajas y un mostrador vacío",
  });

  for (const [index, variant] of slotResult.variants.entries()) {
    console.log(`  ${index + 1}. [${variant.angle}]`);
    for (const [key, value] of Object.entries(variant.slots)) {
      if (value.trim()) console.log(`     ${key}: ${value}`);
    }
    console.log("");
  }
  console.log(
    `  ${slotResult.durationMs}ms · ${formatCostUsd(slotResult.costUsd)} · ${slotResult.warnings.length} warnings\n`,
  );

  assert("returns the requested number of options", slotResult.variants.length === 3,
    String(slotResult.variants.length));

  const angles = slotResult.variants.map((variant) => variant.angle.toLowerCase());
  assert(
    "every option names its angle",
    angles.every((angle) => angle.length > 0),
  );
  assert(
    "the angles are distinct from each other",
    new Set(angles).size === angles.length,
    angles.join(" / "),
  );

  const headlines = slotResult.variants.map((variant) => variant.slots.headline ?? "");
  assert(
    "no option repeats the current headline",
    headlines.every((headline) => headline.trim() !== current.headline),
  );

  /*
    0.6 is a crude bar and deliberately so: it catches "same sentence, two words
    swapped" and nothing subtler. A pass here is not evidence the angles differ,
    only that the wording does — which is why the options are printed above.
  */
  let worst = 0;
  for (let i = 0; i < headlines.length; i++) {
    for (let j = i + 1; j < headlines.length; j++) {
      worst = Math.max(worst, wordOverlap(headlines[i], headlines[j]));
    }
    worst = Math.max(worst, wordOverlap(headlines[i], current.headline));
  }
  assert(
    "no two headlines are near-copies of each other or of the original",
    worst < 0.6,
    `peor solapamiento ${(worst * 100).toFixed(0)}%`,
  );

  const headlineLimit = maxLengthOf(template, "headline");
  assert(
    "every headline respects the template's character limit",
    headlineLimit === null || headlines.every((headline) => headline.length <= headlineLimit),
    `límite ${headlineLimit}, máximo devuelto ${Math.max(...headlines.map((h) => h.length))}`,
  );

  assert(
    "every option fills every slot the template declares",
    slotResult.variants.every((variant) =>
      Object.keys(template.slots.shape).every((key) => key in variant.slots),
    ),
  );

  assert(
    "no headline ends in a full stop",
    headlines.every((headline) => !headline.trim().endsWith(".")),
  );

  assert(
    "no emoji anywhere in the slots",
    !slotResult.variants.some((variant) =>
      /\p{Extended_Pictographic}/u.test(Object.values(variant.slots).join(" ")),
    ),
  );

  // Tuteo leaking into a voseo brand is the failure the batch generator was
  // explicitly checked for; a variant is no different.
  const allSlotText = slotResult.variants
    .flatMap((variant) => Object.values(variant.slots))
    .join(" ")
    .toLowerCase();
  assert(
    "no tuteo leaked into a voseo brand",
    !/\b(tienes|puedes|quieres|necesitas|haces|tu\s+negocio\s+puede)\b/.test(allSlotText),
  );

  // ---------------------------------------------------------------------
  console.log("\n=== Caption variants ===\n");

  const currentCaption = {
    caption:
      "Tu competencia ya tiene un sistema. Vos seguís abriendo tres planillas para saber cuánto facturaste este mes. La diferencia no es la tecnología: es el tiempo que te queda para vender.",
    hashtags: ["pymes", "crm", "gestion"],
    cta: "Escribinos por DM",
  };

  const captionResult = await generateCaptionVariants({
    brand: BRAND,
    postType: "feed",
    current: currentCaption,
    count: 3,
    slideText: current.headline,
  });

  for (const [index, variant] of captionResult.variants.entries()) {
    console.log(`  ${index + 1}. [${variant.angle}]`);
    console.log(`     ${variant.caption.replace(/\n+/g, " ")}`);
    console.log(`     cta: ${variant.cta || "(vacío)"} · ${variant.hashtags.join(" ")}\n`);
  }
  console.log(
    `  ${captionResult.durationMs}ms · ${formatCostUsd(captionResult.costUsd)}\n`,
  );

  assert("returns the requested number of captions", captionResult.variants.length === 3);
  assert(
    "caption angles are distinct",
    new Set(captionResult.variants.map((v) => v.angle.toLowerCase())).size ===
      captionResult.variants.length,
  );
  assert(
    "every caption stays under Instagram's 2200 characters",
    captionResult.variants.every((variant) => variant.caption.length <= 2200),
  );
  assert(
    "hashtags come back normalised: no #, lowercase",
    captionResult.variants.every((variant) =>
      variant.hashtags.every((tag) => !tag.startsWith("#") && tag === tag.toLowerCase()),
    ),
  );
  assert(
    "between 3 and 8 hashtags per option",
    captionResult.variants.every(
      (variant) => variant.hashtags.length >= 3 && variant.hashtags.length <= 8,
    ),
    captionResult.variants.map((v) => v.hashtags.length).join("/"),
  );
  assert(
    "no caption repeats the original",
    captionResult.variants.every(
      (variant) => variant.caption.trim() !== currentCaption.caption.trim(),
    ),
  );

  const totalCost = (slotResult.costUsd ?? 0) + (captionResult.costUsd ?? 0);
  console.log(
    failures === 0
      ? `\nAll ${checks} live variant assertions pass. Total ${formatCostUsd(totalCost)}.`
      : `\n${failures} of ${checks} FAILED. Total ${formatCostUsd(totalCost)}.`,
  );
  console.log(
    "\nThe mechanical checks cannot tell a new ARGUMENT from new WORDING.",
    "\nRead the options above before believing this passed.",
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
