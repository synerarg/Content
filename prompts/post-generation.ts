import type { AnyTemplateDefinition } from "@/templates/registry";
import { FORMATS } from "@/templates/types";

/**
 * Prompts live in versioned files, never as inline strings.
 *
 * Bump the version whenever the wording changes materially. It is written into
 * every `generations` row, so a shift in output quality can be traced back to
 * the exact prompt that produced it.
 */
export const POST_GENERATION_PROMPT_VERSION = "2026-08-05.1";

/** Character budgets, derived from each template's zod schema where declared. */
function slotLimit(template: AnyTemplateDefinition, key: string): number | null {
  const field = template.slots.shape[key];
  // zod v4 exposes checks on the internal def; missing or unexpected shapes
  // simply mean "no stated limit", which is a safe default here.
  const checks =
    (field as unknown as { _zod?: { def?: { checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }> } } })
      ?._zod?.def?.checks ?? [];

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
    const hint = template.slotHints[key] ?? "";
    return `    - ${key}${limit ? ` (máximo ${limit} caracteres)` : ""}: ${hint}`;
  });

  const formats = template.formats
    .map((key) => `${key} (${FORMATS[key].width}x${FORMATS[key].height})`)
    .join(", ");

  return [
    `  ${template.slug} — ${template.name}`,
    `    Cuándo usarla: ${template.description}`,
    `    Formatos: ${formats}`,
    ...slots,
  ].join("\n");
}

/**
 * The stable half of the prompt: role, rules, and the template catalogue.
 *
 * Deliberately contains nothing brand-specific, so it stays byte-identical
 * across every request and every brand. That makes it a cacheable prefix —
 * brand context goes in the user turn instead.
 */
export function buildSystemPrompt(templates: AnyTemplateDefinition[]): string {
  return `Sos redactor senior de una agencia argentina que produce contenido para redes sociales de marcas cliente.

REGLA ARQUITECTÓNICA
Vos escribís SOLO texto. Las imágenes las genera otro modelo y NUNCA contienen texto, letras ni logos: son fondos.
El texto que devolvés lo renderiza código, con la tipografía y los colores reales de la marca.
Por eso nunca describas dónde va el texto, ni pidas que se vea de cierta forma, ni uses markdown en el texto sobre la imagen.

CÓMO ELEGIR PLANTILLA
Elegí la plantilla que le sirva al contenido, no la que llene más campos.
Una afirmación fuerte o un dato va en bold-headline. Una frase de una persona con nombre y cargo va en quote-card.
Si dudás entre las dos, elegí bold-headline.

CATÁLOGO DE PLANTILLAS
${templates.map(describeTemplate).join("\n\n")}

REGLAS DE ESCRITURA
- Respetá los límites de caracteres de cada slot. Son límites duros del diseño: si te pasás, el texto se corta o rompe la pieza.
- Los slots opcionales pueden ir vacíos (""). Vacío es mejor que relleno.
- Sin comillas alrededor de las citas: el diseño ya las dibuja.
- Sin emojis en el texto sobre la imagen. En el caption solo si los captions de ejemplo de la marca los usan.
- Sin hashtags dentro del texto sobre la imagen. Van solo en el campo hashtags.
- El titular no lleva punto final.
- Nada de clichés de marketing: "revolucioná", "potenciá al máximo", "el secreto que nadie te cuenta", "en el mundo de hoy".

CAPTION
El caption es el texto del posteo, no un resumen de la imagen. Puede desarrollar lo que el titular apenas insinúa.
Escribilo en el registro de los captions de ejemplo de la marca. Si la marca usa voseo rioplatense, usá voseo consistente:
"vos tenés", "podés", "necesitás", "hacé", "fijate". Nunca mezcles con tuteo.

HASHTAGS
Entre 3 y 8, sin el símbolo #, en minúscula, específicos del rubro y del mercado argentino.
Nada de #love #instagood ni hashtags genéricos de alcance.`;
}

export function buildUserPrompt({
  brandName,
  toneOfVoice,
  targetAudience,
  exampleCaptions,
  brief,
  requestedFormat,
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  brief: string;
  requestedFormat: string | null;
}): string {
  const sections: string[] = [`MARCA: ${brandName}`];

  if (toneOfVoice.trim()) {
    sections.push(`TONO DE VOZ\n${toneOfVoice.trim()}`);
  }
  if (targetAudience.trim()) {
    sections.push(`AUDIENCIA\n${targetAudience.trim()}`);
  }
  if (exampleCaptions.length > 0) {
    sections.push(
      `CAPTIONS DE EJEMPLO DE LA MARCA (imitá este registro, no los copies)\n${exampleCaptions
        .filter((caption) => caption.trim())
        .map((caption, index) => `${index + 1}. ${caption.trim()}`)
        .join("\n")}`,
    );
  }

  sections.push(`BRIEF\n${brief.trim()}`);
  sections.push(
    requestedFormat
      ? `FORMATO PEDIDO: ${requestedFormat}. Usá ese formato.`
      : "FORMATO: elegí el que mejor le siente al contenido.",
  );

  return sections.join("\n\n");
}
