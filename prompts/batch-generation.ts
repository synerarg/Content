import type { AnyTemplateDefinition } from "@/templates/registry";
import { maxLengthOf } from "@/lib/ai/slot-limits";
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
 *
 * 2026-08-07.1 — products. A batch can carry one, in which case the copy is
 * about that product and the scene briefs for its pieces describe an EMPTY
 * place rather than the product itself.
 *
 * 2026-08-07.2 — the scene stops being generic. Reported from use: the images
 * came back as "any brand's stock photo" however specific the batch brief was.
 * The brief DOES reach them — but only through `background_brief`, which this
 * prompt was asking for in four lines, the first of which said "corta". Two
 * changes, and the second is the one with a mechanism behind it: the section now
 * demands concrete nouns lifted from the brief and rejects a scene that would
 * suit any other client, AND `background_brief` moved after `slides` in the
 * schema so the model writes the scene knowing the headline it sits behind.
 */
export const BATCH_PROMPT_VERSION = "2026-08-07.2";

function describeTemplate(template: AnyTemplateDefinition): string {
  const slots = Object.keys(template.slots.shape).map((key) => {
    const limit = maxLengthOf(template, key);
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
- El objeto "slots" lista los slots de TODAS las plantillas. Llená únicamente los de la plantilla que elegiste para esa placa y dejá todos los demás en cadena vacía (""). Un slot lleno que no pertenece a la plantilla se descarta.
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
Cada pieza lleva un background_brief: la ESCENA fotográfica que va detrás del texto. Lo escribís DESPUÉS de las placas, sabiendo ya qué dice el titular.
La escena es de ESTA pieza, no de la marca en general. Si el titular habla de camionetas paradas, la escena pasa donde están las camionetas; si habla de una cocina a las siete de la mañana, pasa en esa cocina a esa hora.
Nombrá cosas concretas sacadas del brief: el lugar donde ocurre, el oficio de quien está ahí, el objeto que se usa, el momento del día. Con tres o cuatro elementos alcanza.
Una escena que serviría igual para cualquier otra marca está mal, por más linda que sea. Ese es el error a evitar, y es el más fácil de cometer.
Mal: "una oficina moderna y luminosa con plantas". Bien: "el playón de una empresa de logística a las siete de la mañana, tres camionetas blancas alineadas, un mecánico agachado junto a una rueda".
En un carrusel, todas las placas comparten la misma escena base para que se lean como un set.
No menciones texto, carteles ni logos: eso ya se excluye por otro lado.

PRODUCTO
Algunas plantillas muestran la foto REAL de un producto del cliente. Esa foto la pega el diseño con los píxeles originales: vos no la describís ni pedís que se genere.
Si el lote tiene un producto, el background_brief de esas piezas describe un lugar VACÍO donde el producto se va a apoyar — una superficie, una luz, un ambiente — y nunca el producto.
Mal: "una botella de aceite sobre una mesa de madera". Bien: "una mesa de madera junto a una ventana, vacía, con luz de mañana".
Si describís el producto en la escena, el modelo de imagen dibuja uno inventado y la pieza termina con dos productos.`;
}

/** Keeps the history section bounded; the hook and angle live at the top. */
const HISTORY_EXCERPT_CHARS = 220;

export type UsedAngles = {
  angles: Array<{ slug: string; gist: string; keywords: string[] }>;
  hooks: string[];
  phrases: string[];
};

/** The product a batch is about, if it has one. */
export type BatchProduct = { name: string; description: string };

export function buildBatchUserPrompt({
  brandName,
  toneOfVoice,
  targetAudience,
  exampleCaptions,
  brief,
  recipe,
  publishedHistory = [],
  usedAngles,
  product,
  productTemplateSlugs = [],
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  recipe: BatchRecipe;
  /** The product every standalone piece in this batch should be about. */
  product?: BatchProduct;
  /**
   * Which templates composite a product, read from the registry.
   *
   * Passed in rather than written into the prompt text so adding a product
   * template teaches the prompt about itself — the same reason slot names and
   * character limits are reflected out of the zod schemas instead of restated
   * here.
   */
  productTemplateSlugs?: string[];
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

  /*
    The product, before the brief.

    Same placement logic as the forbidden angles: the model reads what the batch
    is ABOUT before it reads what to do with it. A product named after the brief
    tends to be treated as an illustration of the brief; named before it, the
    brief reads as the angle on the product.
  */
  if (product) {
    const lines = [
      "PRODUCTO DEL LOTE",
      `Nombre: ${product.name}`,
    ];
    if (product.description.trim()) {
      lines.push(`Qué es: ${product.description.trim()}`);
    }
    lines.push(
      "",
      "Este lote es sobre este producto. Cada pieza suelta muestra su foto real.",
    );

    if (productTemplateSlugs.length > 0) {
      lines.push(
        `Las piezas de tipo feed e historia tienen que usar una de estas plantillas: ${productTemplateSlugs.join(", ")}.`,
      );
    }

    lines.push(
      "El titular dice qué le resuelve el producto a quien lo ve. No repitas el nombre del producto en el titular: el diseño ya lo muestra.",
      "El background_brief de esas piezas describe el lugar VACÍO donde el producto se va a apoyar, nunca el producto.",
    );

    sections.push(lines.join("\n"));
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
