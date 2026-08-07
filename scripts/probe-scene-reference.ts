/**
 * The scene reference, end to end and A/B.
 *
 * The refinement only pays for itself if BOTH things hold at once:
 *
 *   1. the generated set is lit and framed for the product — that is the point;
 *   2. the product is STILL ABSENT from it.
 *
 * The second is the one at risk. Sending a photograph of an object is the
 * strongest possible argument for drawing that object, and it is being sent
 * alongside a prompt whose whole job is to say "leave this empty". If the model
 * takes the picture as a subject, the piece ships with two products in it — the
 * client's real one composited on top of an invented one.
 *
 * So this generates the SAME brief twice, with and without the reference, and
 * writes both out. A real product photograph is generated first rather than
 * faked with a coloured rectangle: the question is what a MODEL does with a
 * photograph of a bottle, and a 64x64 swatch does not ask it.
 *
 * Three generations. The free tier does ~2/minute, so the 429s in between are
 * expected and waited out.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-scene-reference.ts
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
    "Fotografía documental de producto artesanal, sin pose, como una foto tomada de paso.",
  lighting: "luz dura y lateral de tarde, sombras largas y definidas",
  palette_notes: "verdes oliva, madera oscura, tonos cálidos",
  avoid: ["gente sonriendo a cámara"],
};

/*
  A brief whose light DELIBERATELY contradicts the reference.

  If the scene comes back matching the product's own hard side light rather than
  the soft morning light the brief asks for, the reference is doing real work.
  A brief that already agreed with the photo would prove nothing either way.
*/
const SCENE_BRIEF =
  "una mesada de piedra oscura en una cocina de campo, junto a una ventana";

const PRODUCT_BRIEF = [
  "A single dark green glass olive oil bottle with a plain unlabelled surface, standing alone on a plain white studio background.",
  "Lit hard from the left with a long defined shadow falling to the right, late afternoon quality.",
  "Full frame product photograph, the bottle centred and complete.",
  "The image contains absolutely no text of any kind: no letters, no words, no numbers, no labels with writing, no logos, no watermarks.",
].join(" ");

const provider = getImageProvider();
const size = GENERATION_SIZE.feed;

/** One generation, waiting out the free tier's rate limit rather than failing. */
async function generate(
  prompt: string,
  referenceImage: ReferenceImage | null,
): Promise<GeneratedImage | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
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
      if (cause instanceof RateLimitError && attempt < 3) {
        const waitMs = Math.min(cause.retryAfterMs, 70_000);
        console.log(`    429 — esperando ${Math.round(waitMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      console.log(
        `    FALLÓ: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return null;
    }
  }
  return null;
}

async function main() {
  loadEnv();

  console.log(`Proveedor : ${provider.name} / ${provider.model}`);
  console.log(`Referencia: ${provider.supportsReferenceImage ? "soportada" : "NO soportada"}`);
  console.log(`Prompt    : ${IMAGE_PROMPT_VERSION}\n`);

  if (!provider.supportsReferenceImage) {
    console.log(
      "El proveedor configurado no acepta imagen de referencia. Nada que probar acá.",
    );
    return;
  }

  /*
    The reference is REUSED across runs when the file is already there.

    Comparing two prompt versions means holding everything else still, and a
    freshly generated bottle differs in colour, angle and shadow every time —
    which would make "did the prompt change anything" unanswerable. Delete
    probe-ref-0-product.jpg to start from a new product.
  */
  const PRODUCT_FILE = "probe-ref-0-product.jpg";
  let productBytes: Uint8Array;

  try {
    productBytes = new Uint8Array(readFileSync(PRODUCT_FILE));
    console.log(`--- 1. Reusando ${PRODUCT_FILE} (${productBytes.byteLength} bytes)\n`);
  } catch {
    console.log("--- 1. Generando la foto de producto que hará de referencia");
    const product = await generate(PRODUCT_BRIEF, null);
    if (!product) {
      console.log("Sin producto no hay nada que comparar.");
      process.exitCode = 1;
      return;
    }
    productBytes = product.bytes;
    writeFileSync(PRODUCT_FILE, productBytes);
    console.log(
      `    -> ${PRODUCT_FILE} · ${product.width}x${product.height} · ${product.durationMs}ms\n`,
    );
  }

  const sniffed = sniffImageType(productBytes);
  if (!sniffed) {
    console.log("Los bytes no son una imagen reconocible.");
    process.exitCode = 1;
    return;
  }
  const reference: ReferenceImage = {
    bytes: productBytes,
    contentType: sniffed,
    kind: "product",
  };

  // ---------------------------------------------------------------------
  const withoutReference = composeImagePrompt({
    brief: SCENE_BRIEF,
    artDirection: ART_DIRECTION,
    format: "feed",
    templateSlug: "product-hero",
    hasProduct: true,
    referenceKind: null,
  });

  const withReference = composeImagePrompt({
    brief: SCENE_BRIEF,
    artDirection: ART_DIRECTION,
    format: "feed",
    templateSlug: "product-hero",
    hasProduct: true,
    referenceKind: "product",
  });

  console.log("--- 2. Escena SIN referencia");
  const plain = await generate(withoutReference, null);
  if (plain) {
    writeFileSync("probe-ref-1-sin.jpg", plain.bytes);
    console.log(
      `    -> probe-ref-1-sin.jpg · ${plain.durationMs}ms · referenceUsed=${plain.referenceUsed} · in=${plain.inputTokens ?? "?"} tok\n`,
    );
  }

  console.log("--- 3. Escena CON la foto del producto como referencia");
  const matched = await generate(withReference, reference);
  if (matched) {
    writeFileSync("probe-ref-2-con.jpg", matched.bytes);
    console.log(
      `    -> probe-ref-2-con.jpg · ${matched.durationMs}ms · referenceUsed=${matched.referenceUsed} · in=${matched.inputTokens ?? "?"} tok\n`,
    );
  }

  // ---------------------------------------------------------------------
  if (plain && matched) {
    const extra = (matched.inputTokens ?? 0) - (plain.inputTokens ?? 0);
    console.log(
      `La referencia costó ${extra} tokens de entrada de más (${plain.inputTokens ?? "?"} -> ${matched.inputTokens ?? "?"}).`,
    );
  }

  console.log(
    "\nMirá los tres archivos. Lo que hay que responder, en orden de importancia:",
    "\n  1. ¿La escena CON referencia sigue VACÍA? Si aparece una botella, esto no se usa.",
    "\n  2. ¿La luz de la 3 se parece más a la de la 0 que la de la 2?",
    "\n  3. ¿Alguna metió texto o etiquetas?",
  );
}

void main();
