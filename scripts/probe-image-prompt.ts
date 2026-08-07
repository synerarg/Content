/**
 * The image prompt, against the provider — the before/after this project owed.
 *
 * `IMAGE_PROMPT_VERSION` reached 2026-08-07.2 across two changes that had never
 * met the API, because the Gemini account was empty when both were written:
 *
 *   .1  composition guidance for every background template. Four had none, so
 *       the model composed freely and the type landed over whatever detail
 *       happened to be there.
 *   .2  the empty-staging-area directive for product scenes. Handed "a marble
 *       counter, morning light", a model puts something photogenic on it — and
 *       then the template composites the client's real product on top and the
 *       piece ships with two products in it, one invented.
 *
 * So this generates the SAME brief three ways and writes the files out to be
 * looked at. There is no assertion that can settle "does this look composed":
 * the images are the evidence and the reading has to be recorded honestly.
 *
 * Costs three image generations. The free tier does ~2/minute, so a 429 between
 * them is normal — it waits rather than failing.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-image-prompt.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getImageProvider } from "../lib/image/factory";
import { GENERATION_SIZE, RateLimitError } from "../lib/image/provider";
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
    "Fotografía documental de producto artesanal, sin pose, como una foto tomada de paso.",
  lighting: "luz natural de mañana entrando de costado",
  palette_notes: "verdes oliva, madera clara, tonos cálidos apagados",
  avoid: ["gente sonriendo a cámara", "escritorios ordenados"],
};

const BRIEF =
  "una mesada de madera en una cocina de campo a media mañana, junto a una ventana";

/*
  What the prompt looked like BEFORE any of this: the subject plus the non-
  negotiable no-text rule, and nothing else. Reconstructed here rather than kept
  in the codebase, because the comparison needs it exactly once.
*/
function barePrompt(brief: string): string {
  return [
    brief,
    "The image contains absolutely no text of any kind.",
    "No letters, no words, no numbers, no typography, no captions, no subtitles.",
    "No watermarks, no logos, no brand marks, no signage.",
    "Clean photographic background only.",
  ].join(" ");
}

const CASES = [
  {
    file: "probe-1-bare.jpg",
    label: "ANTES — sólo el brief y la regla de no-texto",
    prompt: barePrompt(BRIEF),
  },
  {
    file: "probe-2-composed.jpg",
    label: "DESPUÉS — composeImagePrompt, plantilla bold-headline, sin producto",
    prompt: composeImagePrompt({
      brief: BRIEF,
      artDirection: ART_DIRECTION,
      format: "feed",
      templateSlug: "bold-headline",
      hasProduct: false,
    }),
  },
  {
    file: "probe-3-product-scene.jpg",
    label: "DESPUÉS — plantilla product-hero, hasProduct: true (set vacío)",
    prompt: composeImagePrompt({
      brief: BRIEF,
      artDirection: ART_DIRECTION,
      format: "feed",
      templateSlug: "product-hero",
      hasProduct: true,
    }),
  },
];

async function main() {
  loadEnv();

  const provider = getImageProvider();
  const size = GENERATION_SIZE.feed;

  console.log(`Proveedor : ${provider.name} / ${provider.model}`);
  console.log(`Prompt    : ${IMAGE_PROMPT_VERSION}`);
  console.log(`Brief     : ${BRIEF}\n`);

  for (const item of CASES) {
    console.log(`--- ${item.label}`);
    console.log(`    ${item.prompt.slice(0, 200)}…\n`);

    // The free tier is ~2 images/minute, so one 429 between cases is expected
    // rather than exceptional. Honour the delay the provider asks for and go
    // again, exactly as the queue does.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const image = await provider.generate({
          prompt: item.prompt,
          width: size.width,
          height: size.height,
          aspectRatio: size.aspectRatio,
          seed: null,
        });

        writeFileSync(item.file, image.bytes);
        console.log(
          `    -> ${item.file} · ${image.width}x${image.height} · ${image.megapixels} MP · ${image.durationMs}ms\n`,
        );
        break;
      } catch (cause) {
        if (cause instanceof RateLimitError && attempt < 2) {
          const waitMs = Math.min(cause.retryAfterMs, 70_000);
          console.log(`    429 — esperando ${Math.round(waitMs / 1000)}s\n`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        console.log(
          `    FALLÓ: ${cause instanceof Error ? cause.message : String(cause)}\n`,
        );
        break;
      }
    }
  }

  console.log(
    "Mirá los tres archivos. Lo que hay que responder:",
    "\n  1. ¿El 2 deja la parte de abajo tranquila para el titular, y el 1 no?",
    "\n  2. ¿El 3 tiene el centro VACÍO, sin ningún objeto puesto ahí?",
    "\n  3. ¿Alguno metió texto, carteles o logos?",
  );
}

void main();
