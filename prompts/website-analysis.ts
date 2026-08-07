/**
 * Reading a company's website to draft a Brand Kit.
 *
 * 2026-08-07.1 — first version.
 */
export const WEBSITE_PROMPT_VERSION = "2026-08-07.1";

/*
  WHAT THE MODEL IS AND IS NOT ASKED FOR

  Not asked for: colours, fonts, or anything else that can be counted. Those are
  extracted from the CSS by lib/web/extract-brand.ts, because a model reading
  hex codes out of a stylesheet occasionally invents one and cannot be checked.

  Asked for: the judgement. What this company sounds like, who it is talking to,
  and what a photograph for it should look like — none of which is written
  anywhere on the page, and all of which a careful reader can infer from it.

  The output is explicitly a DRAFT. The prompt says so, because the alternative
  is a model that fills every field confidently from a three-line landing page,
  and a confident wrong tone of voice is worse than an empty one: nobody edits
  what looks finished.
*/
const SYSTEM = `Sos director de estrategia de una agencia argentina. Te dan el texto del sitio web de un cliente nuevo y armás el borrador de su kit de marca.

QUÉ DEVOLVÉS
- tagline: la promesa de la marca en una línea. Si el sitio ya tiene una buena, usala tal cual.
- tone_of_voice: cómo habla esta marca. Registro, tratamiento, qué palabras usa y cuáles evita. Tres o cuatro líneas, concretas y accionables — no "profesional y cercano", que no le sirve a nadie.
- target_audience: a quién le habla. Rubro, tamaño, rol de quien decide, y qué problema tiene.
- example_captions: 3 captions de ejemplo EN EL REGISTRO DE LA MARCA, como referencia de escritura. No los inventes desde cero: sacalos de cómo el sitio ya se expresa.
- art_direction.photographic_style: qué tipo de foto le corresponde a esta marca. Concreto: qué se ve, cómo está encuadrado.
- art_direction.lighting: la luz que le va.
- art_direction.palette_notes: cómo se comporta el color en sus imágenes.
- art_direction.avoid: 3 a 6 cosas que NO tienen que aparecer en sus fotos.
- confidence: "alta", "media" o "baja" — cuánta información real había en el sitio.
- notes: qué NO pudiste inferir y conviene completar a mano. Sé específico.

REGLAS
- Esto es un BORRADOR para que una persona revise, no un kit terminado. Si el sitio no dice algo, decilo en notes en vez de inventarlo.
- Un sitio de tres líneas da confidence "baja". No lo disimules escribiendo más.
- Escribí en español rioplatense. Si el sitio usa voseo, decilo explícitamente en tone_of_voice: es la regla que después evita que el generador mezcle con tuteo.
- No menciones colores ni tipografías: eso se saca del CSS por otro lado.
- Nada de clichés de agencia: "soluciones a medida", "potenciamos tu marca", "en el mundo de hoy".`;

export function buildWebsiteSystemPrompt(): string {
  return SYSTEM;
}

export function buildWebsiteUserPrompt({
  url,
  title,
  description,
  siteName,
  text,
  truncated,
}: {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  text: string;
  truncated: boolean;
}): string {
  const sections = [`SITIO: ${url}`];

  if (siteName) sections.push(`NOMBRE DEL SITIO: ${siteName}`);
  if (title) sections.push(`TÍTULO: ${title}`);
  if (description) sections.push(`DESCRIPCIÓN: ${description}`);

  sections.push(`TEXTO DE LA PÁGINA\n${text}`);

  /*
    Said out loud so the model can lower its own confidence.

    A page cut off mid-way looks, from the inside, exactly like a page that ends
    there — and a short page is the main reason to answer "baja".
  */
  if (truncated) {
    sections.push(
      "NOTA: el contenido está cortado porque la página es muy larga. Tenelo en cuenta al evaluar la confianza.",
    );
  }

  sections.push(
    "Armá el borrador del kit. Lo que no esté en el sitio, ponelo en notes en vez de inventarlo.",
  );

  return sections.join("\n\n");
}
