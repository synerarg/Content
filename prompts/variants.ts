import type { AnyTemplateDefinition } from "@/templates/registry";
import { maxLengthOf } from "@/lib/ai/slot-limits";
import type { UsedAngles } from "./batch-generation";

/**
 * Alternatives for ONE piece that already exists.
 *
 * 2026-08-07.1 — first version.
 */
export const VARIANTS_PROMPT_VERSION = "2026-08-07.1";

/*
  THE FAILURE MODE THIS PROMPT EXISTS TO AVOID

  Ask a model for "three other options" and it returns the same idea three
  times: the words move, the argument does not. That is worse than useless here,
  because three near-identical options look like a choice and cost the reader
  the time to discover they aren't one.

  The fix is the same one the published-history work landed on, for the same
  reason: name the axis of difference instead of asking for difference. Each
  variant is required to change WHAT IT ARGUES — the objection it answers, the
  moment it catches the reader in, who it is about, or what kind of proof it
  offers — and the current text's own angle is explicitly out of bounds. A model
  told "be different" rephrases; a model told "this one answers a price
  objection, so do not answer a price objection" has to move.
*/
const SYSTEM = `Sos redactor senior de una agencia argentina. Te dan UNA pieza que ya existe y devolvés alternativas reales para reemplazarla.

QUÉ ES UNA ALTERNATIVA REAL
Cambiar las palabras no es una alternativa: es la misma pieza escrita distinto.
Cada opción tiene que cambiar el ARGUMENTO. Ejes para moverse, uno por opción:
- otra objeción del cliente (precio, tiempo, confianza, complejidad)
- otro momento del problema (antes de que pase, mientras pasa, después)
- otro protagonista (el dueño, el empleado, el cliente final, el número)
- otro tipo de prueba (un dato, un caso, una comparación, una pregunta)

REGLAS
- El ángulo de la pieza actual queda PROHIBIDO: no lo repitas ni reformulado.
- Las opciones también tienen que ser distintas ENTRE SÍ, no sólo de la actual.
- Respetá los límites de caracteres. Son límites duros del diseño, no sugerencias.
- Los slots opcionales pueden ir vacíos (""). Vacío es mejor que relleno.
- Sin comillas alrededor de las citas: el diseño ya las dibuja.
- Sin emojis y sin hashtags sobre la imagen.
- Los titulares no llevan punto final.
- Nada de clichés: "revolucioná", "potenciá al máximo", "en el mundo de hoy".

REGLA ARQUITECTÓNICA
Vos escribís SOLO texto. La imagen de fondo la genera otro modelo y nunca lleva texto ni logos.
Nunca describas dónde va el texto ni pidas que se vea de cierta forma.

Por cada opción devolvés un "angle": dos o tres palabras que nombran el argumento que usa
("objeción de precio", "miedo a migrar", "el costo de no hacerlo"). Es lo que le permite a
quien elige ver en qué se diferencian sin leerlas enteras.`;

export function buildVariantsSystemPrompt(): string {
  return SYSTEM;
}

function describeSlots(template: AnyTemplateDefinition): string {
  return Object.keys(template.slots.shape)
    .map((key) => {
      const limit = maxLengthOf(template, key);
      const label = template.slotLabels[key] ?? key;
      return `- ${key} (${label}${limit ? `, máx ${limit} car.` : ""}): ${
        template.slotHints[key] ?? ""
      }`;
    })
    .join("\n");
}

function brandSection({
  brandName,
  toneOfVoice,
  targetAudience,
  exampleCaptions,
  usedAngles,
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  usedAngles?: UsedAngles;
}): string[] {
  const sections = [`MARCA: ${brandName}`];

  if (toneOfVoice.trim()) sections.push(`TONO DE VOZ\n${toneOfVoice.trim()}`);
  if (targetAudience.trim()) sections.push(`AUDIENCIA\n${targetAudience.trim()}`);

  const captions = exampleCaptions.filter((caption) => caption.trim());
  if (captions.length > 0) {
    sections.push(
      `CAPTIONS DE EJEMPLO DE LA MARCA (imitá el registro, no los copies)\n${captions
        .map((caption, index) => `${index + 1}. ${caption.trim()}`)
        .join("\n")}`,
    );
  }

  /*
    The brand's already-published angles are forbidden here too.

    A variant is a second chance to say something, and handing back an argument
    the brand used three months ago is exactly as repetitive as it would have
    been in the original batch — with the extra sting that someone chose it
    deliberately from a list.
  */
  if (usedAngles && usedAngles.angles.length > 0) {
    sections.push(
      [
        "ÁNGULOS QUE ESTA MARCA YA PUBLICÓ — ninguna opción puede usarlos:",
        ...usedAngles.angles.map((angle) => `- ${angle.slug}: ${angle.gist}`),
      ].join("\n"),
    );
  }

  return sections;
}

export function buildSlotVariantsPrompt({
  template,
  format,
  current,
  count,
  sceneBrief,
  ...brand
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  usedAngles?: UsedAngles;
  template: AnyTemplateDefinition;
  format: string;
  current: Record<string, string>;
  count: number;
  /** The scene already generated for this slide, when there is one. */
  sceneBrief?: string;
}): string {
  const sections = brandSection(brand);

  sections.push(
    [
      `PLANTILLA: ${template.slug} — ${template.name}`,
      template.description,
      `Formato: ${format}`,
      "",
      "SLOTS A COMPLETAR",
      describeSlots(template),
    ].join("\n"),
  );

  sections.push(
    [
      "PIEZA ACTUAL — su argumento queda prohibido",
      ...Object.entries(current).map(
        ([key, value]) => `${key}: ${value?.trim() ? value.trim() : "(vacío)"}`,
      ),
    ].join("\n"),
  );

  /*
    The scene is stated as a CONSTRAINT, not as context.

    The background image already exists and is not regenerated when copy
    changes — it costs money and, on the free tier, minutes. A variant that
    only makes sense over a different photograph is one that cannot be used,
    so the scene is part of the brief rather than something to work around.
  */
  if (sceneBrief?.trim()) {
    sections.push(
      [
        "ESCENA DEL FONDO — ya está generada y NO se cambia",
        sceneBrief.trim(),
        "",
        "Las opciones tienen que funcionar sobre esta imagen. No propongas nada que necesite otra foto.",
      ].join("\n"),
    );
  }

  sections.push(
    `Devolvé exactamente ${count} opciones, cada una con todos los slots completos y un "angle" que la nombre.`,
  );

  return sections.join("\n\n");
}

export function buildCaptionVariantsPrompt({
  postType,
  current,
  count,
  slideText,
  ...brand
}: {
  brandName: string;
  toneOfVoice: string;
  targetAudience: string;
  exampleCaptions: string[];
  usedAngles?: UsedAngles;
  postType: string;
  current: { caption: string; hashtags: string[]; cta: string };
  count: number;
  /** What the images actually say, so the caption does not contradict them. */
  slideText?: string;
}): string {
  const sections = brandSection(brand);

  sections.push(`TIPO DE PIEZA: ${postType}`);

  if (slideText?.trim()) {
    sections.push(
      [
        "TEXTO QUE YA ESTÁ SOBRE LAS IMÁGENES — el caption lo acompaña, no lo repite",
        slideText.trim(),
      ].join("\n"),
    );
  }

  sections.push(
    [
      "CAPTION ACTUAL — su argumento queda prohibido",
      current.caption.trim() || "(vacío)",
      "",
      `CTA actual: ${current.cta.trim() || "(vacío)"}`,
      `Hashtags actuales: ${current.hashtags.join(", ") || "(ninguno)"}`,
    ].join("\n"),
  );

  sections.push(
    [
      "CADA OPCIÓN LLEVA",
      "- caption: el texto del posteo, máximo 2200 caracteres, en el registro de la marca.",
      "- cta: el llamado a la acción, dos o tres palabras. Puede ir vacío.",
      "- hashtags: entre 3 y 8, sin #, en minúscula, específicos del rubro y del mercado argentino.",
      "- angle: dos o tres palabras que nombren el argumento.",
      "",
      "Si la marca usa voseo rioplatense, usá voseo consistente: nunca mezcles con tuteo.",
      `Devolvé exactamente ${count} opciones.`,
    ].join("\n"),
  );

  return sections.join("\n\n");
}
