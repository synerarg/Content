/**
 * Where to put the duplicate threshold — measured, not guessed.
 *
 * This is the probe HANDOFF §10 asks for. The keyword-collision metric built
 * during the published-history work reported 0/7 for both the good run and the
 * bad one and was useless; the note ends "a real check needs semantic
 * similarity". A semantic check with a threshold picked by intuition would be
 * the same mistake wearing better clothes.
 *
 * The trap that makes guessing fail here: cosine similarity between UNRELATED
 * Spanish marketing copy is already high. A first measurement put two sentences
 * with nothing in common — spreadsheets versus olive oil — at 0.73. Anyone
 * reaching for "0.8 sounds like a lot" would ship a warning that fires on
 * everything.
 *
 * So the pairs below are labelled by what they SHOULD be, the run prints the
 * spread of each band, and the threshold is whatever separates them. Re-run it
 * if the embedding model or its dimensionality ever changes — the bands move.
 *
 * Costs one batch embedding call (fractions of a cent).
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/probe-embeddings.ts
 */
import { readFileSync } from "node:fs";
import { embedTexts, EMBEDDING_DIMENSIONS } from "../lib/ai/embeddings";
import { DUPLICATE_THRESHOLD } from "../lib/ai/similarity";

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
  Real captions in the brand's real register, because the threshold has to hold
  for the text this app actually produces. Generic sentences would separate more
  cleanly and teach us nothing.
*/
const TEXTS = {
  // The failure that started all of this: the same argument, three ways.
  competencia_a:
    "Tu competencia ya tiene un sistema para seguir a sus clientes. Vos seguís abriendo tres planillas para saber cuánto facturaste este mes.",
  competencia_b:
    "Mientras vos buscás un presupuesto viejo entre planillas, el de enfrente ya le respondió al cliente. Esa es toda la diferencia.",
  competencia_c:
    "Cada semana que pasa sin ordenar tus clientes, la distancia con los que sí lo hicieron se agranda un poco más.",

  // The pair HANDOFF names: nothing lexical connects them.
  catalogo_a:
    "Un catálogo de fotos no cobra. Lo que cobra es que alguien pueda encontrar lo que busca y pagarlo sin escribirte.",
  catalogo_b:
    "Tu sitio no es un catálogo de fotos: es el lugar donde tu cliente decide si te compra o sigue buscando.",

  // Same TOPIC, genuinely different argument. These must NOT be flagged, and
  // they are the hardest case — a threshold that catches the paraphrases above
  // and spares these is the one worth having.
  tiempo_distinto:
    "Tres horas por semana se te van en pasar datos de una planilla a otra. Ese es el sueldo de alguien que podría estar vendiendo.",
  riesgo_distinto:
    "Si el único que sabe cómo funciona tu operación se toma vacaciones, tu operación se toma vacaciones.",

  // Unrelated, same language and register. The floor.
  aceite:
    "Aceite de oliva extra virgen, primera prensada en frío, cosechado a mano en Maipú. Sin mezclas y sin apuro.",
  peluqueria:
    "Reservá tu turno online y elegí con quién te querés atender. Sin llamadas, sin esperar respuesta por mensaje.",
};

type Band = "duplicado" | "mismo tema" | "no relacionado";

const PAIRS: Array<[keyof typeof TEXTS, keyof typeof TEXTS, Band]> = [
  ["competencia_a", "competencia_b", "duplicado"],
  ["competencia_a", "competencia_c", "duplicado"],
  ["competencia_b", "competencia_c", "duplicado"],
  ["catalogo_a", "catalogo_b", "duplicado"],

  ["competencia_a", "tiempo_distinto", "mismo tema"],
  ["competencia_a", "riesgo_distinto", "mismo tema"],
  ["tiempo_distinto", "riesgo_distinto", "mismo tema"],
  ["catalogo_a", "competencia_a", "mismo tema"],

  ["competencia_a", "aceite", "no relacionado"],
  ["catalogo_a", "peluqueria", "no relacionado"],
  ["tiempo_distinto", "aceite", "no relacionado"],
  ["aceite", "peluqueria", "no relacionado"],
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

async function main() {
  loadEnv();

  const keys = Object.keys(TEXTS) as Array<keyof typeof TEXTS>;
  const vectors = await embedTexts(keys.map((key) => TEXTS[key]));

  const byKey = new Map<string, number[]>();
  keys.forEach((key, index) => {
    const vector = vectors[index];
    if (vector) byKey.set(key, vector);
  });

  if (byKey.size !== keys.length) {
    console.error("No volvieron todos los vectores.");
    process.exitCode = 1;
    return;
  }

  // Normalisation is what makes a plain dot product the cosine. Assert it
  // rather than trust it: an unnormalised vector would silently shift every
  // number below and quietly invalidate the threshold.
  const norms = [...byKey.values()].map((v) => Math.sqrt(cosine(v, v)));
  const normalised = norms.every((n) => Math.abs(n - 1) < 1e-6);
  console.log(
    `${EMBEDDING_DIMENSIONS} dims · normalizados: ${normalised ? "sí" : "NO — el umbral no vale"}\n`,
  );

  const bands = new Map<Band, number[]>();

  for (const [left, right, band] of PAIRS) {
    const score = cosine(byKey.get(left)!, byKey.get(right)!);
    bands.set(band, [...(bands.get(band) ?? []), score]);
    console.log(
      `  ${score.toFixed(4)}  ${band.padEnd(15)} ${left} ~ ${right}`,
    );
  }

  console.log("");
  const summary = new Map<Band, { min: number; max: number }>();
  for (const [band, scores] of bands) {
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    summary.set(band, { min, max });
    console.log(`  ${band.padEnd(15)} ${min.toFixed(4)} … ${max.toFixed(4)}`);
  }

  const duplicates = summary.get("duplicado")!;
  const sameTopic = summary.get("mismo tema")!;
  const unrelated = summary.get("no relacionado")!;

  console.log("");
  console.log(`  Umbral configurado: ${DUPLICATE_THRESHOLD}`);

  let failures = 0;
  const check = (label: string, ok: boolean, detail: string) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
    if (!ok) failures++;
  };

  check(
    "every duplicate is at or above the threshold",
    duplicates.min >= DUPLICATE_THRESHOLD,
    `el más bajo es ${duplicates.min.toFixed(4)}`,
  );
  check(
    "nothing merely on-topic reaches it",
    sameTopic.max < DUPLICATE_THRESHOLD,
    `el más alto es ${sameTopic.max.toFixed(4)}`,
  );
  check(
    "unrelated copy is nowhere near it",
    unrelated.max < DUPLICATE_THRESHOLD,
    `el más alto es ${unrelated.max.toFixed(4)}`,
  );

  const margin = duplicates.min - sameTopic.max;
  console.log(
    `\n  Separación entre "duplicado" y "mismo tema": ${margin.toFixed(4)}.`,
  );
  if (margin < 0.02) {
    console.log(
      "  Es MUY angosta. El umbral distingue poco: tratá los avisos como una sugerencia, no como un veredicto.",
    );
  }

  console.log(
    failures === 0
      ? "\nEl umbral separa las tres bandas."
      : `\n${failures} banda(s) mal separadas — ajustá DUPLICATE_THRESHOLD en lib/ai/similarity.ts.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
