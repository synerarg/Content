import type { AnyTemplateDefinition } from "@/templates/registry";
import { FORMATS } from "@/templates/types";
import {
  describeRecipe,
  expandRecipe,
  KIND_LABEL,
  type BatchRecipe,
} from "@/lib/batch/recipe";

/**
 * Batch prompt. Versioned, and recorded on every `generations` row so a change
 * in output quality can be traced to the wording that caused it.
 *
 * 2026-08-06.1 — the user prompt asks for an explicit composition (a recipe)
 * instead of a piece count, and enumerates the pieces one per line so the model
 * has a list to fill rather than a structure to invent.
 */
export const BATCH_PROMPT_VERSION = "2026-08-06.1";

function slotLimit(template: AnyTemplateDefinition, key: string): number | null {
  const field = template.slots.shape[key];
  const checks =
    (field as unknown as {
      _zod?: {
        def?: {
          checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }>;
        };
      };
    })?._zod?.def?.checks ?? [];

  for (const check of checks) {
    const def = check?._zod?.def;
    if (def?.check === "max_length" && typeof def.maximum === "number") {
      return def.maximum;
    }
  }
  return null;
}

function describeTemplate(template: AnyTemplateDefinition): string {
  const slots = Object.keys(template.slots.shape).map((key) => {
    const limit = slotLimit(template, key);
    return `    - ${key}${limit ? ` (máx ${limit} car.)` : ""}: ${
      template.slotHints[key] ?? ""
    }`;
  });

  return [
    `  ${template.slug} [rol: ${template.role}] — ${template.name}`,
    `    ${template.description}`,
    `    Formatos: ${template.formats.map((k) => FORMATS[k].label).join(", ")}`,
    ...slots,
  ].join("\n");
}

export function buildBatchSystemPrompt(
  templates: AnyTemplateDefinition[],
): string {
  return `Sos redactor senior de una agencia argentina. Producís lotes de contenido para redes sociales de marcas cliente.

REGLA ARQUITECTÓNICA
Vos escribís SOLO texto. Las imágenes las genera otro modelo y NUNCA contienen texto ni logos: son fondos.
El texto lo renderiza código con la tipografía y los colores reales de la marca.
Nunca describas dónde va el texto ni pidas que se vea de cierta forma.

QUÉ ES UN LOTE
Un lote es un conjunto de piezas que se publican en los días siguientes y que, juntas, cuentan algo coherente.
No repitas el mismo contenido en distintos formatos: cada pieza aporta un ángulo distinto del mismo tema.

TIPOS DE PIEZA
- feed: una placa sola, formato feed.
- story: una placa sola, formato historia. Se ve dos segundos: menos texto, más directo.
- carousel: varias placas. La primera SIEMPRE usa una plantilla de rol "cover"; las siguientes, rol "body".
  Desarrolla una idea por placa, en orden. La cantidad de placas te la indica el pedido, no la elegís vos.

CATÁLOGO DE PLANTILLAS
${templates.map(describeTemplate).join("\n\n")}

REGLAS DE ESCRITURA
- Respetá los límites de caracteres. Son límites duros del diseño.
- Los slots opcionales pueden ir vacíos (""). Vacío es mejor que relleno.
- Sin comillas alrededor de las citas: el diseño ya las dibuja.
- Sin emojis sobre la imagen. Sin hashtags sobre la imagen.
- Los titulares no llevan punto final.
- Nada de clichés: "revolucioná", "potenciá al máximo", "en el mundo de hoy".

CAPTION Y HASHTAGS
Cada pieza lleva su propio caption, en el registro de los captions de ejemplo de la marca.
Si la marca usa voseo rioplatense, usá voseo consistente: "tenés", "podés", "hacé". Nunca mezcles con tuteo.
Entre 3 y 8 hashtags por pieza, sin #, en minúscula, específicos del rubro y del mercado argentino.

FONDO
Cada pieza lleva un background_brief: una descripción corta de la ESCENA fotográfica que va de fondo.
Describí un lugar o una situación real y concreta, no un concepto abstracto.
En un carrusel, todas las placas comparten la misma escena base para que se lean como un set.
No menciones texto, carteles ni logos: eso ya se excluye por otro lado.`;
}

/** Keeps the history section bounded; the hook and angle live at the top. */
const HISTORY_EXCERPT_CHARS = 220;

export type UsedAngles = {
  angles: Array<{ slug: string; gist: string; keywords: string[] }>;
  hooks: string[];
  phrases: string[];
};

export function buildBatchUserPrompt({
  brandName,
  toneOfVoice,
  targetAudience,
  exampleCaptions,
  brief,
  recipe,
  publishedHistory = [],
  usedAngles,
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  recipe: BatchRecipe;
  /**
   * Captions this brand has already published, newest first.
   *
   * Goes in the USER prompt, never the system prompt. The system prompt is
   * identical for every brand and is cached — putting per-brand history there
   * would fragment one shared cache entry into one per client and pay the write
   * cost on every batch.
   */
  publishedHistory?: string[];
  /**
   * Angles and hooks already used, named by the history analysis step.
   *
   * Preferred over `publishedHistory`: raw captions were tested and the model
   * repeated an angle that was in the list it had been handed. Naming the
   * angles turns an inference into an instruction.
   */
  usedAngles?: UsedAngles;
}): string {
  const sections: string[] = [`MARCA: ${brandName}`];

  if (toneOfVoice.trim()) sections.push(`TONO DE VOZ\n${toneOfVoice.trim()}`);
  if (targetAudience.trim()) sections.push(`AUDIENCIA\n${targetAudience.trim()}`);

  const captions = exampleCaptions.filter((c) => c.trim());
  if (captions.length > 0) {
    sections.push(
      `CAPTIONS DE EJEMPLO DE LA MARCA (imitá el registro, no los copies)\n${captions
        .map((c, i) => `${i + 1}. ${c.trim()}`)
        .join("\n")}`,
    );
  }

  /*
    What the brand has already published.

    Placed BEFORE the brief so the model reads the constraint before it reads
    the task — asking it to avoid repetition after it has already formed an
    angle tends to produce a rephrasing of that angle rather than a new one.
  */
  const history = publishedHistory
    .map((caption) => caption.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  /*
    Named prohibitions come FIRST and are phrased as a hard constraint.

    The earlier version pasted the captions here and asked the model not to
    repeat them. It repeated one anyway — the angle it reused was sitting in
    that very list. Asking a model to infer an abstraction and then avoid it,
    while the brief pulls toward the same place, is two jobs; naming the angles
    reduces it to one.
  */
  if (usedAngles && usedAngles.angles.length > 0) {
    const lines = [
      "ÁNGULOS PROHIBIDOS EN ESTE LOTE",
      "Esta marca ya publicó estos argumentos. NINGUNA pieza puede volver a usarlos, ni reformulados:",
      ...usedAngles.angles.map(
        (angle) => `- ${angle.slug}: ${angle.gist}`,
      ),
    ];

    if (usedAngles.hooks.length > 0) {
      lines.push(
        "",
        "GANCHOS PROHIBIDOS (recursos de forma ya gastados)",
        ...usedAngles.hooks.map((hook) => `- ${hook}`),
      );
    }

    if (usedAngles.phrases.length > 0) {
      lines.push(
        "",
        "FRASES YA USADAS — no las repitas literalmente:",
        ...usedAngles.phrases.map((phrase) => `- "${phrase}"`),
      );
    }

    lines.push(
      "",
      "Antes de escribir cada pieza, verificá que su argumento no sea ninguno de los prohibidos.",
      "Si el brief te empuja hacia un ángulo prohibido, buscá otro: cambiá de objeción, de momento del problema, de protagonista o de tipo de prueba.",
    );

    sections.push(lines.join("\n"));
  } else if (history.length > 0) {
    // Fallback for when no analysis exists yet. Measurably weaker — see the
    // note above — but better than nothing.
    sections.push(
      [
        "CONTENIDO QUE ESTA MARCA YA PUBLICÓ (de más nuevo a más viejo)",
        ...history.map(
          (caption, i) =>
            `${i + 1}. ${caption.slice(0, HISTORY_EXCERPT_CHARS)}${caption.length > HISTORY_EXCERPT_CHARS ? "…" : ""}`,
        ),
        "",
        "Ninguna pieza de este lote puede repetir el ángulo, el gancho ni la estructura de las de arriba.",
      ].join("\n"),
    );
  }

  sections.push(`BRIEF DEL LOTE\n${brief.trim()}`);

  /*
    The composition is spelled out piece by piece, in order, rather than
    described in prose. "1 carrusel de 4 placas · 1 feed · 3 historias" is
    unambiguous to a person and still leaves a model room to miscount; a
    numbered list of exactly the pieces to produce does not. The array it
    returns is expected to match this list position for position, which is also
    what makes the result verifiable afterwards.
  */
  const pieces = expandRecipe(recipe);
  const lines = pieces.map((piece, index) => {
    const slides =
      piece.type === "carousel"
        ? `${piece.slides} placas (la 1 rol cover, el resto rol body)`
        : "1 placa";
    return `${index + 1}. ${KIND_LABEL[piece.type]} — ${slides}`;
  });

  sections.push(
    [
      `COMPOSICIÓN EXACTA DEL LOTE: ${describeRecipe(recipe)}`,
      "",
      `Devolvé exactamente ${pieces.length} piezas, en este orden y con esta cantidad de placas cada una:`,
      ...lines,
      "",
      "No agregues piezas, no saques, no cambies el tipo de ninguna y no cambies la cantidad de placas.",
      "Cada pieza tiene que aportar un ángulo distinto del mismo tema.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
