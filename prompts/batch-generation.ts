import type { AnyTemplateDefinition } from "@/templates/registry";
import { FORMATS } from "@/templates/types";

/**
 * Batch prompt. Versioned, and recorded on every `generations` row so a change
 * in output quality can be traced to the wording that caused it.
 */
export const BATCH_PROMPT_VERSION = "2026-08-05.1";

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
  Un carrusel tiene entre 3 y 5 placas y desarrolla una idea por placa, en orden.

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

export function buildBatchUserPrompt({
  brandName,
  toneOfVoice,
  targetAudience,
  exampleCaptions,
  brief,
  postCount,
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  postCount: number;
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

  sections.push(`BRIEF DEL LOTE\n${brief.trim()}`);
  sections.push(
    `Generá exactamente ${postCount} piezas. Incluí al menos un carrusel si el tema da para desarrollar en pasos.`,
  );

  return sections.join("\n\n");
}
