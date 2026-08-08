/**
 * Does the batch brief actually reach the IMAGE?
 *
 * Reported from use: however specific the batch brief was, the backgrounds came
 * back as "any brand's stock photo". The brief does reach them, but only
 * through one derived field — Claude writes a `background_brief` per piece and
 * that string is the entire input to the image model. So a generic image is a
 * generic `background_brief`, and the question is what makes Claude write one.
 *
 * Two suspects, both addressed in prompt `2026-08-07.2`:
 *
 *   1. The FONDO section asked for "una descripción corta" of "un lugar", and
 *      never said the scene had to belong to THIS piece. "Una oficina moderna y
 *      luminosa" satisfies every word of the old instruction.
 *   2. `background_brief` sat BEFORE `slides` in the schema. A structured
 *      output is emitted in schema order, so the model picked the photograph
 *      before it knew what the headline said.
 *
 * This runs the same brief through both versions — old prompt + old field
 * order, new prompt + new order — and prints the scenes side by side. That
 * stage costs about US$0.05 and may settle it on its own. Then it generates one
 * image per scene for the first pieces of each arm, because a scene that reads
 * better as text is not yet a picture that looks better.
 *
 * Six images. The free tier does ~2/minute, so expect it to sit waiting.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-scene-brief.ts
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-scene-brief.ts --texto
 *     (--texto stops after the two Claude calls and generates no images)
 */
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TEMPLATES } from "../templates/registry";
import {
  buildBatchSystemPrompt,
  buildBatchUserPrompt,
  BATCH_PROMPT_VERSION,
} from "../prompts/batch-generation";
import { batchSchema, BATCH_MODEL } from "../lib/ai/generate-batch";
import { getImageProvider } from "../lib/image/factory";
import {
  GENERATION_SIZE,
  RateLimitError,
  type GeneratedImage,
} from "../lib/image/provider";
import { composeImagePrompt } from "../prompts/image-prompt";
import type { BatchRecipe } from "../lib/batch/recipe";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}

/*
  The FONDO section as it stood in 2026-08-07.1, verbatim.

  Kept here rather than behind a flag in the prompt module: production should
  carry one version of its own instructions, and the thing being compared
  against is history. The replacement is asserted below — a silent no-op would
  make this probe compare the new prompt with itself and report a tie.
*/
const OLD_FONDO = `FONDO
Cada pieza lleva un background_brief: una descripción corta de la ESCENA fotográfica que va de fondo.
Describí un lugar o una situación real y concreta, no un concepto abstracto.
En un carrusel, todas las placas comparten la misma escena base para que se lean como un set.
No menciones texto, carteles ni logos: eso ya se excluye por otro lado.`;

const NEW_FONDO_HEAD =
  "FONDO\nCada pieza lleva un background_brief: la ESCENA fotográfica que va detrás del texto.";

/*
  A brief with real subject matter, in a trade with a LOOK of its own.

  The failure being chased is a scene that would suit any client, so the brief
  has to be one where a correct scene is unmistakable: a logistics yard at seven
  in the morning is not an open-plan office with plants. A vague brief would let
  both arms answer generically and prove nothing.
*/
const BRIEF = `Lanzamos mantenimiento preventivo para flotas chicas, de 3 a 10 camionetas.
El argumento central es que una camioneta parada un día cuesta más que el service que la habría evitado:
el reparto que no sale, el cliente que no recibe, el chofer que cobra igual.
Hablamos de repartidores, corralones y distribuidoras del conurbano, no de flotas corporativas.`;

const BRAND = {
  brandName: "Taller Peralta",
  toneOfVoice:
    "Directo y sin vueltas, voseo rioplatense. Habla como un mecánico que explica, no como una empresa. Nunca promete resultados ni usa signos de exclamación.",
  targetAudience:
    "Dueños de repartos y distribuidoras chicas del conurbano bonaerense, entre 3 y 10 camionetas, que manejan la flota ellos mismos.",
  exampleCaptions: [
    "Si la camioneta te deja a pie un martes, el problema no es la camioneta: es que nadie la miró en seis meses.",
    "Vino por un ruido. Se fue con la correa cambiada y sin el motor fundido que le esperaba en marzo.",
  ],
};

const RECIPE: BatchRecipe = [
  { type: "feed", count: 2, slides: 1 },
  { type: "story", count: 1, slides: 1 },
];

/** The 08-07.1 schema: `background_brief` before `slides`. */
function oldOrderSchema() {
  const post = batchSchema.shape.posts.element.shape;
  return z.object({
    title: batchSchema.shape.title,
    posts: z
      .array(
        z.object({
          type: post.type,
          caption: post.caption,
          hashtags: post.hashtags,
          cta: post.cta,
          background_brief: post.background_brief,
          slides: post.slides,
        }),
      )
      .min(1),
  });
}

type Arm = {
  label: string;
  system: string;
  schema: z.ZodObject;
};

async function runArm(client: Anthropic, arm: Arm) {
  const started = Date.now();
  const response = await client.messages.parse({
    model: BATCH_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: arm.system }],
    messages: [
      {
        role: "user",
        content: buildBatchUserPrompt({ ...BRAND, brief: BRIEF, recipe: RECIPE }),
      },
    ],
    output_config: { format: zodOutputFormat(arm.schema) },
  });

  const parsed = response.parsed_output as
    | { posts: Array<{ background_brief: string; slides: Array<{ slots: Record<string, string> }> }> }
    | null;

  if (!parsed) {
    console.log(`  ${arm.label}: sin resultado (${response.stop_reason})`);
    return [];
  }

  console.log(
    `  ${arm.label}: ${parsed.posts.length} piezas · ${Date.now() - started}ms · ${response.usage.output_tokens} tok`,
  );

  if (process.argv.includes("--crudo")) {
    console.log(`\n----- ${arm.label} crudo\n${JSON.stringify(parsed, null, 1)}\n-----\n`);
  }

  return parsed.posts.map((post) => ({
    scene: post.background_brief.trim(),
    headline:
      post.slides[0]?.slots.headline ??
      post.slides[0]?.slots.statement ??
      post.slides[0]?.slots.after ??
      "",
  }));
}

const provider = getImageProvider();
const size = GENERATION_SIZE.feed;

async function generate(prompt: string): Promise<GeneratedImage | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await provider.generate({
        prompt,
        width: size.width,
        height: size.height,
        aspectRatio: size.aspectRatio,
        seed: null,
        referenceImage: null,
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

async function main() {
  loadEnv();

  const newSystem = buildBatchSystemPrompt(TEMPLATES);

  // The new prompt must contain the new section and NOT the old one, or the two
  // arms are the same prompt and every conclusion below is worthless.
  if (!newSystem.includes(NEW_FONDO_HEAD)) {
    console.error("El prompt en producción no tiene la sección FONDO nueva. Abortando.");
    process.exitCode = 1;
    return;
  }

  // Rebuild the old arm by swapping the whole FONDO block back.
  const start = newSystem.indexOf("FONDO\n");
  const end = newSystem.indexOf("\n\nPRODUCTO");
  if (start === -1 || end === -1 || end <= start) {
    console.error("No pude ubicar la sección FONDO para reemplazarla. Abortando.");
    process.exitCode = 1;
    return;
  }
  const oldArmSystem =
    newSystem.slice(0, start) + OLD_FONDO + newSystem.slice(end);

  if (oldArmSystem === newSystem || !oldArmSystem.includes("descripción corta")) {
    console.error("El reemplazo no cambió nada. Abortando antes de gastar plata.");
    process.exitCode = 1;
    return;
  }

  console.log(`Prompt de lote : ${BATCH_PROMPT_VERSION}`);
  console.log(`Imagen         : ${provider.name} / ${provider.model}`);
  console.log(`Receta         : 2 feed + 1 historia\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  console.log("=== 1. Las dos versiones, mismo brief");
  const before = await runArm(client, {
    label: "ANTES (08-07.1)",
    system: oldArmSystem,
    schema: oldOrderSchema(),
  });
  const after = await runArm(client, {
    label: "AHORA (08-07.2)",
    system: newSystem,
    schema: batchSchema,
  });

  console.log("\n=== 2. Las escenas que escribió cada una\n");
  const rows = Math.max(before.length, after.length);
  for (let i = 0; i < rows; i++) {
    console.log(`  Pieza ${i + 1}`);
    console.log(`    ANTES  titular: ${before[i]?.headline ?? "—"}`);
    console.log(`           escena : ${before[i]?.scene ?? "—"}`);
    console.log(`    AHORA  titular: ${after[i]?.headline ?? "—"}`);
    console.log(`           escena : ${after[i]?.scene ?? "—"}\n`);
  }

  if (process.argv.includes("--texto")) {
    console.log("--texto: no se generaron imágenes.");
    return;
  }

  console.log("=== 3. Las mismas escenas, como imagen\n");

  const artDirection = {
    photographic_style:
      "Fotografía documental, sin pose, luz real, como una foto tomada de paso.",
    lighting: "luz natural de mañana",
    palette_notes: "grises fríos, azul de trabajo, naranja de señalización",
    avoid: ["gente sonriendo a cámara"],
  };

  const pairs: Array<{ tag: string; scene: string }> = [];
  for (let i = 0; i < Math.min(3, rows); i++) {
    if (before[i]) pairs.push({ tag: `antes-${i + 1}`, scene: before[i].scene });
    if (after[i]) pairs.push({ tag: `ahora-${i + 1}`, scene: after[i].scene });
  }

  for (const pair of pairs) {
    const prompt = composeImagePrompt({
      brief: pair.scene,
      artDirection,
      format: "feed",
      templateSlug: "bold-headline",
      hasProduct: false,
      referenceKind: null,
    });

    const image = await generate(prompt);
    if (!image) {
      console.log(`  ${pair.tag}: sin imagen`);
      continue;
    }
    const file = `probe-escena-${pair.tag}.jpg`;
    writeFileSync(file, image.bytes);
    console.log(`  ${pair.tag} -> ${file} · ${image.durationMs}ms`);
  }

  console.log(
    "\nMirá los pares antes/ahora. Lo que hay que responder:",
    "\n  1. ¿Se reconoce el rubro del brief en la imagen NUEVA? ¿Y en la vieja?",
    "\n  2. ¿Las tres nuevas son escenas DISTINTAS entre sí, o la misma tres veces?",
    "\n  3. ¿Alguna quedó tan cargada que un titular encima no se leería?",
  );
}

void main().catch((cause) => {
  console.error(`\nFalló: ${cause instanceof Error ? cause.message : cause}`);
  process.exitCode = 1;
});
