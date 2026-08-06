/**
 * History analysis prompt.
 *
 * Turns a brand's published captions into an explicit list of angles and hooks
 * it has already used, so the batch prompt can forbid them by name.
 *
 * The reason this step exists at all: passing raw captions to the batch call
 * and asking it not to repeat them was tested and did not work. It requires the
 * model to abstract an angle out of each caption AND then avoid that
 * abstraction, while the brief pushes hard in the same direction. It repeated an
 * angle that was sitting in the list it had been given. Naming the angles up
 * front turns "infer what not to do" into "do not do these named things".
 */
export const HISTORY_PROMPT_VERSION = "2026-08-06.1";

export function buildHistorySystemPrompt(): string {
  return `Analizás el contenido ya publicado por una marca en redes sociales, para que el próximo contenido no lo repita.

TU TAREA
Leé los posts y extraé los patrones que se repiten. No resumas los posts: identificá QUÉ RECURSO usa cada uno.

QUÉ ES UN ÁNGULO
El argumento de fondo, independiente del tema. Ejemplos de ángulos distintos sobre un mismo tema:
- "tu competencia ya lo hizo y vos no" (presión social)
- "estás perdiendo plata ahora mismo" (costo de no actuar)
- "esto es más barato de lo que creés" (objeción de precio)
- "mirá lo que le pasó a este cliente" (prueba social concreta)
Dos posts con el mismo ángulo se sienten repetidos aunque hablen de temas distintos.

QUÉ ES UN GANCHO
El recurso de forma: cómo abre o cómo pide interacción.
Ejemplos: "comentá la palabra X", pregunta retórica al inicio, dato estadístico de apertura, negación provocadora ("no busques X, buscá Y").

REGLAS
- Un ángulo por patrón real. Si dos posts comparten ángulo, es UN ángulo, no dos.
- Nombrá cada ángulo con un slug corto en minúsculas separado por guiones.
- En "keywords" poné 3 a 6 palabras o frases concretas que delaten ese ángulo si volviera a aparecer. Tienen que ser términos que aparecerían literalmente en un texto que use ese ángulo.
- No inventes patrones que no estén. Si sólo hay tres ángulos, devolvé tres.
- Escribí todo en español rioplatense.`;
}

export function buildHistoryUserPrompt(captions: string[]): string {
  return [
    "POSTS YA PUBLICADOS POR ESTA MARCA",
    ...captions.map(
      (caption, i) => `\n[${i + 1}]\n${caption.replace(/\s+/g, " ").trim()}`,
    ),
    "",
    "Extraé los ángulos y los ganchos que se repiten.",
  ].join("\n");
}
