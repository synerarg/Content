/**
 * Do a carousel's four backgrounds read as one shoot?
 *
 * The problem, on record since Phase 7: a carousel's slides share only their
 * `background_brief`, so they come back as four unrelated photographs —
 * different room, different light, different palette. Seeds are the usual fix
 * and are not available: Gemini ignores them entirely.
 *
 * The fix under test hands the FIRST slide's background to every slide after it
 * as a reference, asking for the same place and a different frame. Two things
 * can go wrong and they pull in opposite directions:
 *
 *   1. no cohesion — the reference is ignored and nothing changes;
 *   2. TOO much — four near-identical frames, which is a different bad carousel.
 *
 * Only eyes can settle that, so this writes both sets out side by side: four
 * slides generated the old way, four generated with the anchor. Same brief,
 * same art direction, same cover/body composition guidance.
 *
 * Eight generations. The free tier does ~2/minute, so expect it to sit waiting.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-carousel-cohesion.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getImageProvider } from "../lib/image/factory";
import {
  GENERATION_SIZE,
  RateLimitError,
  sniffImageType,
  type GeneratedImage,
  type ReferenceImage,
} from "../lib/image/provider";
import { composeImagePrompt, IMAGE_PROMPT_VERSION } from "../prompts/image-prompt";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}

const ART_DIRECTION = {
  photographic_style:
    "Fotografía documental de oficina real, sin pose, como una foto tomada de paso.",
  lighting: "luz natural de tarde entrando de costado",
  palette_notes: "maderas claras, gris cálido, un verde apagado",
  avoid: ["gente sonriendo a cámara", "escritorios perfectamente ordenados"],
};

/*
  A brief broad enough that a model WILL wander if nothing holds it.

  "Un depósito" could be any warehouse anywhere, which is exactly the condition
  under which the four slides drifted apart. A hyper-specific brief would hide
  the problem instead of testing the fix.
*/
const BRIEF =
  "el depósito de una pyme de repuestos a media tarde, con estanterías y un mostrador";

const provider = getImageProvider();
const size = GENERATION_SIZE.feed;
const SLIDES = 4;

async function generate(
  prompt: string,
  referenceImage: ReferenceImage | null,
): Promise<GeneratedImage | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await provider.generate({
        prompt,
        width: size.width,
        height: size.height,
        aspectRatio: size.aspectRatio,
        seed: null,
        referenceImage,
      });
    } catch (cause) {
      if (cause instanceof RateLimitError && attempt < 4) {
        const waitMs = Math.min(cause.retryAfterMs, 70_000);
        console.log(`      429 — esperando ${Math.round(waitMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      console.log(
        `      FALLÓ: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return null;
    }
  }
  return null;
}

/** Slide 0 is the cover; the rest are body slides, as the generator assigns them. */
function promptFor(index: number, kind: "product" | "scene" | null): string {
  return composeImagePrompt({
    brief: BRIEF,
    artDirection: ART_DIRECTION,
    format: "feed",
    templateSlug: index === 0 ? "carousel-cover" : "carousel-body",
    hasProduct: false,
    referenceKind: kind,
    slideIndex: index,
  });
}

async function runSet(
  label: string,
  filePrefix: string,
  useAnchor: boolean,
): Promise<void> {
  console.log(`\n=== ${label}`);

  let anchor: ReferenceImage | null = null;

  for (let index = 0; index < SLIDES; index++) {
    // The anchor only ever exists from the second slide on, and only because
    // the first one succeeded — which is exactly what the route enforces.
    const reference = useAnchor && index > 0 ? anchor : null;
    const image = await generate(promptFor(index, reference ? "scene" : null), reference);

    if (!image) {
      console.log(`  placa ${index + 1}: sin imagen`);
      continue;
    }

    const file = `${filePrefix}-${index + 1}.jpg`;
    writeFileSync(file, image.bytes);
    console.log(
      `  placa ${index + 1} -> ${file} · ${image.durationMs}ms · ref=${image.referenceUsed} · in=${image.inputTokens ?? "?"} tok`,
    );

    if (useAnchor && index === 0) {
      const sniffed = sniffImageType(image.bytes);
      if (sniffed) {
        anchor = { bytes: image.bytes, contentType: sniffed, kind: "scene" };
      }
    }
  }
}

async function main() {
  loadEnv();

  console.log(`Proveedor : ${provider.name} / ${provider.model}`);
  console.log(`Prompt    : ${IMAGE_PROMPT_VERSION}`);
  console.log(`Brief     : ${BRIEF}`);

  if (!provider.supportsReferenceImage) {
    console.log("\nEl proveedor configurado no acepta referencia. Nada que probar.");
    return;
  }

  // `--con` runs only the anchored set: re-testing a prompt change does not
  // need the baseline generated again, and each set is four paid images.
  if (!process.argv.includes("--con")) {
    await runSet("SIN ancla — el comportamiento actual", "probe-car-sin", false);
  }
  await runSet("CON ancla — la primera placa guía a las demás", "probe-car-con", true);

  console.log(
    "\nMirá los dos sets. Lo que hay que responder:",
    "\n  1. ¿Las cuatro CON ancla parecen el mismo lugar? ¿Y las SIN ancla no?",
    "\n  2. ¿Las CON ancla son encuadres DISTINTOS, o cuatro veces la misma foto?",
    "\n     (Cuatro copias es tan mal carrusel como cuatro lugares distintos.)",
    "\n  3. ¿Alguna metió texto o carteles?",
  );
}

void main();
