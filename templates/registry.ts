import type { z } from "zod";
import { BoldHeadline, boldHeadlineSlots } from "./bold-headline";
import { QuoteCard, quoteCardSlots } from "./quote-card";
import { ListTips, listTipsSlots } from "./list-tips";
import { CarouselCover, carouselCoverSlots } from "./carousel-cover";
import { CarouselBody, carouselBodySlots } from "./carousel-body";
import { StoryCta, storyCtaSlots } from "./story-cta";
import { EditorialSplit, editorialSplitSlots } from "./editorial-split";
import { Statement, statementSlots } from "./statement";
import { ProductHero, productHeroSlots } from "./product-hero";
import { ProductShowcase, productShowcaseSlots } from "./product-showcase";
import { ComparisonRows, comparisonRowsSlots } from "./comparison-rows";
import { BigNumber, bigNumberSlots } from "./big-number";
import { BeforeAfter, beforeAfterSlots } from "./before-after";
import { FeatureStack, featureStackSlots } from "./feature-stack";
import type { FormatKey, TemplateProps, TemplateRole } from "./types";

/**
 * The template catalogue.
 *
 * Each entry pairs a component with the zod schema for its text slots. That
 * schema is the single source of truth: it generates the editor's inputs, and
 * it becomes the JSON schema Claude fills in. One definition, two consumers, no
 * drift.
 */
export type AnyTemplateDefinition = {
  slug: string;
  name: string;
  description: string;
  role: TemplateRole;
  formats: FormatKey[];
  slots: z.ZodObject;
  /**
   * What each slot is CALLED on screen, in Spanish.
   *
   * The slot keys are English identifiers (`headline`, `swipe_hint`) because
   * they are also the JSON keys Claude fills in. Rendering those keys directly
   * as field labels — which is what the editor used to do — put "headline" and
   * "swipe hint" in front of account managers. The label is the visible name;
   * the key stays an implementation detail.
   */
  slotLabels: Record<string, string>;
  slotHints: Record<string, string>;
  /**
   * Whether this template renders a generated background at all.
   *
   * Defaults to true. A template that ignores `backgroundUrl` — a purely
   * typographic card — must say so, or the queue spends a paid image and 10-20
   * seconds producing something nothing will ever display. It also changes what
   * "complete" means: the export must not block on a missing background for a
   * slide that was never going to have one.
   */
  usesBackground?: boolean;
  /**
   * Whether this template composites a client product.
   *
   * Defaults to false. Setting it changes three things at once, which is why it
   * is a registry flag and not something each screen decides for itself: the
   * piece needs a product chosen before it is complete, the export gate must
   * refuse to rasterize it without one (a product template with no product is a
   * dashed placeholder box, and that is not a file to hand a client), and the
   * scene prompt has to leave an empty staging area instead of composing freely.
   */
  usesProduct?: boolean;
  /**
   * Whether the product needs a real cut-out to look right here.
   *
   * Informational, never a hard block: both product templates render an opaque
   * photo as a deliberately framed image rather than refusing. It exists so the
   * picker can say so BEFORE the piece is generated, instead of leaving someone
   * to work out why their product looks like a photo stuck onto a photo.
   */
  requiresCutout?: boolean;
  /**
   * Rendering is inherently dynamic — the slug is only known at runtime — so
   * the props type is widened here. Slot values are validated against `slots`
   * before they reach the component, which is where the safety comes from.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<TemplateProps<any>>;
};

export const TEMPLATES: AnyTemplateDefinition[] = [
  {
    slug: "bold-headline",
    name: "Titular protagonista",
    description:
      "Una afirmación fuerte sobre la imagen. Para ganchos, datos y anuncios.",
    role: "single",
    formats: ["feed", "story"],
    slots: boldHeadlineSlots,
    slotLabels: {
      headline: "Titular",
      subline: "Bajada",
      cta: "Llamado a la acción",
    },
    slotHints: {
      headline:
        "El gancho. Una idea sola, idealmente menos de 10 palabras. Sin punto final.",
      subline: "Una línea que suma contexto o la consecuencia. Opcional.",
      cta: "Dos o tres palabras en imperativo. Opcional.",
    },
    component: BoldHeadline,
  },
  {
    slug: "quote-card",
    name: "Cita",
    description:
      "Una frase textual con autoría. Para testimonios y frases de posicionamiento.",
    role: "single",
    formats: ["feed", "story"],
    slots: quoteCardSlots,
    slotLabels: {
      quote: "La frase",
      author: "Autor",
      role: "Cargo o empresa",
    },
    slotHints: {
      quote: "La frase textual, sin comillas: el diseño ya las pone.",
      author: "Quién lo dijo. Opcional.",
      role: "Cargo o empresa, para dar autoridad. Opcional.",
    },
    component: QuoteCard,
  },
  {
    slug: "list-tips",
    name: "Lista de tips",
    description:
      "Tres puntos numerados. Para consejos, señales de alerta y checklists.",
    role: "single",
    formats: ["feed", "story"],
    slots: listTipsSlots,
    slotLabels: {
      title: "Encabezado de la lista",
      item_1: "Punto 1",
      item_2: "Punto 2",
      item_3: "Punto 3",
    },
    slotHints: {
      title: "El encabezado de la lista. Corto y concreto.",
      item_1: "Primer punto. Una idea por punto, sin subordinadas.",
      item_2: "Segundo punto.",
      item_3: "Tercer punto. Podés dejarlo vacío si con dos alcanza.",
    },
    component: ListTips,
  },
  {
    slug: "story-cta",
    name: "Historia con CTA",
    description:
      "Diseñada para historia: el CTA queda arriba de la zona del pulgar.",
    role: "single",
    formats: ["story", "feed"],
    slots: storyCtaSlots,
    slotLabels: {
      headline: "Titular",
      subline: "Bajada",
      cta: "Llamado a la acción",
    },
    slotHints: {
      headline: "El gancho, corto. La historia se ve dos segundos.",
      subline: "Una línea de contexto. Opcional.",
      cta: "La acción concreta: 'Escribinos por DM', 'Link en bio'.",
    },
    component: StoryCta,
  },
  {
    slug: "editorial-split",
    name: "Editorial partida",
    description:
      "La foto ocupa una banda y el texto va sobre color plano. Para cuando la imagen acompaña en vez de protagonizar.",
    role: "single",
    formats: ["feed", "story"],
    slots: editorialSplitSlots,
    slotLabels: {
      eyebrow: "Etiqueta",
      headline: "Titular",
      subline: "Bajada",
    },
    slotHints: {
      eyebrow:
        "Dos o tres palabras que categorizan la pieza: 'Caso real', 'Guía', 'Novedad'. Opcional.",
      headline: "El titular. Acá entra más texto que en las placas con foto a sangre.",
      subline: "El desarrollo, en una o dos líneas. Opcional.",
    },
    component: EditorialSplit,
  },
  {
    slug: "statement",
    name: "Frase sin foto",
    description:
      "Sólo tipografía sobre el color de la marca. La más rápida y la que nunca parece generada.",
    role: "single",
    formats: ["feed", "story"],
    slots: statementSlots,
    // No image: the queue skips it, and the export never waits for one.
    usesBackground: false,
    slotLabels: {
      statement: "La frase",
      attribution: "Atribución",
    },
    slotHints: {
      statement:
        "La idea entera, sin apoyo visual. Tiene que sostenerse sola: cuanto más corta, más grande se ve.",
      attribution: "Quién lo dice, o de dónde sale el dato. Opcional.",
    },
    component: Statement,
  },
  {
    slug: "product-hero",
    name: "Producto en escena",
    description:
      "La foto real del producto sobre una escena generada. El modelo hace la escena; el producto se pega, nunca se redibuja.",
    role: "single",
    formats: ["feed", "story"],
    slots: productHeroSlots,
    usesProduct: true,
    requiresCutout: true,
    slotLabels: {
      headline: "Titular",
      detail: "Detalle o ficha",
      cta: "Llamado a la acción",
    },
    slotHints: {
      headline:
        "Qué le resuelve el producto a quien lo ve. No repitas el nombre del producto: el diseño ya lo pone.",
      detail:
        "El dato concreto: medida, materia prima, plazo de entrega, precio. Opcional.",
      cta: "Dos o tres palabras en imperativo. Opcional.",
    },
    component: ProductHero,
  },
  {
    slug: "product-showcase",
    name: "Producto sobre color",
    description:
      "El producto sobre el color de la marca, sin foto generada. Rápida, gratis y nunca parece hecha por una IA.",
    role: "single",
    formats: ["feed", "story"],
    slots: productShowcaseSlots,
    // No generated image: the queue skips it and the export never waits for one.
    usesBackground: false,
    usesProduct: true,
    slotLabels: {
      headline: "Titular",
      detail: "Detalle o ficha",
      cta: "Llamado a la acción",
    },
    slotHints: {
      headline:
        "La idea principal, corta. Sin foto de fondo, el titular es todo el peso visual.",
      detail: "Ficha, beneficio o precio. Una o dos líneas. Opcional.",
      cta: "La acción concreta: 'Pedilo por DM', 'Link en bio'. Opcional.",
    },
    component: ProductShowcase,
  },
  {
    slug: "comparison-rows",
    name: "Comparativa",
    description:
      "Filas apiladas donde la fila de la marca gana. Para precio, comisiones y prestaciones.",
    role: "single",
    formats: ["feed", "story"],
    slots: comparisonRowsSlots,
    // Sólo tipografía: la cola se la saltea y el export no espera imagen.
    usesBackground: false,
    slotLabels: {
      headline: "Titular",
      row_1_label: "Alternativa 1",
      row_1_value: "Valor 1",
      row_2_label: "Alternativa 2",
      row_2_value: "Valor 2",
      row_3_label: "Alternativa 3",
      row_3_value: "Valor 3",
      mine_label: "La marca",
      mine_value: "Valor de la marca",
      footnote: "Condición",
    },
    slotHints: {
      headline: "Qué se está comparando. Una línea.",
      row_1_label: "La alternativa, con su nombre real. Opcional.",
      row_1_value: "El número o la palabra que la define. Corto: entra en una línea.",
      row_2_label: "Segunda alternativa. Opcional.",
      row_2_value: "Su valor.",
      row_3_label: "Tercera alternativa. Opcional.",
      row_3_value: "Su valor.",
      mine_label: "El nombre de la marca. Va última y destacada.",
      mine_value: "Lo que hace ganar la comparación: 'Gratis', '0%', '24 h'.",
      footnote:
        "La condición que hace verdadera la comparación. Sin esto es una afirmación que después contesta el cliente.",
    },
    component: ComparisonRows,
  },
  {
    slug: "big-number",
    name: "Número gigante",
    description:
      "Una sola cifra enorme y todo lo demás chico. Para descuentos, plazos y resultados.",
    role: "single",
    formats: ["feed", "story"],
    slots: bigNumberSlots,
    slotLabels: {
      eyebrow: "Antetítulo",
      number: "El número",
      unit: "Unidad",
      support: "Bajada",
      cta: "Llamado a la acción",
    },
    slotHints: {
      eyebrow: "Lo que va arriba, chico: 'Aprovechá hasta', 'Ahorrás'. Opcional.",
      number: "La cifra sola: '20%', '$36.000', '3x'. Cuanto más corta, más grande se ve.",
      unit: "La palabra que la completa, en su propia línea: 'OFF', 'anual'. Opcional.",
      support: "Una línea que dice de qué se trata. Opcional.",
      cta: "Dos o tres palabras en imperativo. Opcional.",
    },
    component: BigNumber,
  },
  {
    slug: "before-after",
    name: "Antes y después",
    description:
      "La forma vieja tachada y la nueva abajo. Para reemplazos, migraciones y simplificaciones.",
    role: "single",
    formats: ["feed", "story"],
    slots: beforeAfterSlots,
    usesBackground: false,
    slotLabels: {
      before: "Antes (tachado)",
      after: "Después",
      support: "Bajada",
      cta: "Llamado a la acción",
    },
    slotHints: {
      before:
        "Lo que se reemplaza. Escribilo como par con el de abajo: 'Cinco herramientas'.",
      after: "Lo que lo reemplaza, en la misma clave: 'Una suscripción'.",
      support: "Una línea de contexto. Opcional.",
      cta: "Dos o tres palabras en imperativo. Opcional.",
    },
    component: BeforeAfter,
  },
  {
    slug: "feature-stack",
    name: "Beneficios sobre la imagen",
    description:
      "Tarjetas translúcidas con tildes sobre la foto. Para prestaciones, promos y planes.",
    role: "single",
    formats: ["feed", "story"],
    slots: featureStackSlots,
    slotLabels: {
      headline: "Titular",
      item_1: "Beneficio 1",
      item_2: "Beneficio 2",
      item_3: "Beneficio 3",
      cta: "Llamado a la acción",
      footnote: "Letra chica",
    },
    slotHints: {
      headline: "La promesa que los beneficios sostienen.",
      item_1: "Un beneficio concreto por tarjeta. Sin subordinadas.",
      item_2: "Segundo beneficio. Opcional.",
      item_3: "Tercero. Con dos suele alcanzar.",
      cta: "La acción concreta: 'Activá tu cuenta'. Opcional.",
      footnote: "La condición de la que dependen los beneficios. Opcional pero casi siempre necesaria.",
    },
    component: FeatureStack,
  },
  {
    slug: "carousel-cover",
    name: "Carrusel · tapa",
    description:
      "Primera placa de un carrusel. Promete lo que las siguientes desarrollan.",
    role: "cover",
    formats: ["feed", "story"],
    slots: carouselCoverSlots,
    slotLabels: {
      headline: "Titular de tapa",
      subline: "Bajada",
      swipe_hint: "Invitación a deslizar",
    },
    slotHints: {
      headline: "La promesa del carrusel. Tiene que dar ganas de deslizar.",
      subline: "Qué se va a encontrar adentro. Opcional.",
      swipe_hint: "Invitación corta: 'Deslizá', 'Mirá cómo'.",
    },
    component: CarouselCover,
  },
  {
    slug: "carousel-body",
    name: "Carrusel · cuerpo",
    description:
      "Placa interna de un carrusel. Una idea por placa, numerada.",
    role: "body",
    formats: ["feed", "story"],
    slots: carouselBodySlots,
    slotLabels: {
      step: "Número de placa",
      headline: "Titular",
      body: "Desarrollo",
    },
    slotHints: {
      step: "El número de placa: 01, 02, 03.",
      headline: "La idea de esta placa, en pocas palabras.",
      body: "El desarrollo. Dos o tres líneas como mucho.",
    },
    component: CarouselBody,
  },
];

export const TEMPLATE_MAP = new Map(
  TEMPLATES.map((template) => [template.slug, template]),
);

export function getTemplate(slug: string): AnyTemplateDefinition | undefined {
  return TEMPLATE_MAP.get(slug);
}

export function templatesByRole(role: TemplateRole): AnyTemplateDefinition[] {
  return TEMPLATES.filter((template) => template.role === role);
}

/** Templates usable as a standalone post — i.e. not carousel-only parts. */
export const SINGLE_TEMPLATES = TEMPLATES.filter((t) => t.role === "single");

/** Empty slot values for a template, so the editor starts with every field present. */
export function emptySlots(template: AnyTemplateDefinition): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of Object.keys(template.slots.shape)) {
    values[key] = "";
  }
  return values;
}

export function slotKeys(template: AnyTemplateDefinition): string[] {
  return Object.keys(template.slots.shape);
}

/** Sample copy for gallery previews, so templates are never shown empty. */
export const TEMPLATE_SAMPLES: Record<string, Record<string, string>> = {
  "bold-headline": {
    headline: "Tu CRM no es un gasto, es tiempo que recuperás",
    subline: "Tres horas por semana que hoy se te van en planillas.",
    cta: "Ver cómo",
  },
  "quote-card": {
    quote: "Dejamos de perder presupuestos en el mail. Eso solo ya lo pagó.",
    author: "Marina Duarte",
    role: "Dueña, Duarte Instalaciones",
  },
  "list-tips": {
    title: "Tres señales de que necesitás un CRM",
    item_1: "Buscás un presupuesto viejo y tardás más de cinco minutos.",
    item_2: "Un cliente te pregunta algo que ya habías respondido.",
    item_3: "El seguimiento depende de que alguien se acuerde.",
  },
  "story-cta": {
    headline: "¿Cuánto tiempo perdés buscando información?",
    subline: "Contanos tu caso y te mostramos por dónde empezar.",
    cta: "Escribinos por DM",
  },
  "editorial-split": {
    eyebrow: "Caso real",
    headline: "Pasaron de tres planillas a una sola pantalla",
    subline: "Y el seguimiento dejó de depender de que alguien se acuerde.",
  },
  statement: {
    statement: "Si tenés que abrir tres planillas para saber cuánto facturaste, no tenés un sistema: tenés un problema.",
    attribution: "Synera",
  },
  "product-hero": {
    headline: "El mismo aceite que usan tres cocinas premiadas",
    detail: "500 ml · primera prensada en frío · Maipú, Mendoza",
    cta: "Pedilo",
  },
  "product-showcase": {
    headline: "Cosecha 2026, ya disponible",
    detail: "Sólo 400 botellas numeradas. Cuando se termina, se termina.",
    cta: "Reservá la tuya",
  },
  "comparison-rows": {
    headline: "Lo que cobra cada uno por cargar tu catálogo",
    row_1_label: "Agencia tradicional",
    row_1_value: "$180.000",
    row_2_label: "Freelance",
    row_2_value: "$90.000",
    row_3_label: "Hacerlo vos",
    row_3_value: "12 h",
    mine_label: "Synera",
    mine_value: "Incluido",
    footnote: "Catálogo de hasta 200 productos, precios de agosto 2026.",
  },
  "big-number": {
    eyebrow: "Recuperás",
    number: "3 h",
    unit: "por semana",
    support: "Es lo que hoy se te va buscando presupuestos viejos.",
    cta: "Ver cómo",
  },
  "before-after": {
    before: "Tres planillas y un cuaderno",
    after: "Una sola pantalla",
    support: "El seguimiento dejó de depender de que alguien se acuerde.",
    cta: "Ver el caso",
  },
  "feature-stack": {
    headline: "Todo lo que entra en el plan de agosto",
    item_1: "Doce piezas al mes, guionadas y diseñadas",
    item_2: "Calendario cargado con dos semanas de anticipación",
    item_3: "Cambios ilimitados hasta que salga como lo pensaste",
    cta: "Escribinos por DM",
    footnote: "Plan mensual, sin permanencia mínima. Precios de agosto 2026.",
  },
  "carousel-cover": {
    headline: "Cinco cosas que tu pyme deja de perder con un CRM",
    subline: "Ninguna tiene que ver con la tecnología.",
    swipe_hint: "Deslizá",
  },
  "carousel-body": {
    step: "01",
    headline: "Dejás de perder clientes en el olvido",
    body: "El seguimiento no depende de la memoria de nadie: queda anotado y con fecha.",
  },
};

// ---------------------------------------------------------------------------
// Slot presentation and completeness
// ---------------------------------------------------------------------------

/** What this slot is called on screen. Falls back to the key, de-underscored. */
export function slotLabel(template: AnyTemplateDefinition, key: string): string {
  return template.slotLabels[key] ?? key.replace(/_/g, " ");
}

/** One line of help for this slot, or null if it needs none. */
export function slotHint(
  template: AnyTemplateDefinition,
  key: string,
): string | null {
  return template.slotHints[key] ?? null;
}

/*
  Whether a slot must be filled, read off the zod schema.

  The schema already encodes it: a required slot carries `.min(1, "…")`, an
  optional one does not. Reading it here keeps the schema the single source of
  truth — the same reason max_length is read from it rather than duplicated —
  so a template that changes which slots are mandatory needs no second edit.

  Reaches into zod v4 internals, verified against 4.4.3. The identical pattern
  in lib/ai/generate-batch.ts reads max_length; both need re-checking on a zod
  upgrade.
*/
export function isSlotRequired(
  template: AnyTemplateDefinition,
  key: string,
): boolean {
  const field = template.slots.shape[key];
  const checks =
    (field as unknown as {
      _zod?: {
        def?: {
          checks?: Array<{ _zod?: { def?: { check?: string; minimum?: number } } }>;
        };
      };
    })?._zod?.def?.checks ?? [];

  return checks.some((check) => {
    const def = check?._zod?.def;
    return def?.check === "min_length" && (def.minimum ?? 0) >= 1;
  });
}

/** Required slots for a template, in declaration order. */
export function requiredSlots(template: AnyTemplateDefinition): string[] {
  return Object.keys(template.slots.shape).filter((key) =>
    isSlotRequired(template, key),
  );
}

/**
 * Every required slot on this slide has text.
 *
 * Used to gate the ZIP export: rasterizing a slide whose headline is empty
 * produces a PNG with a hole in it, and that is the kind of thing that reaches
 * a client before anyone notices.
 */
export function isSlideTextComplete(
  templateSlug: string,
  slots: Record<string, string>,
): boolean {
  const template = getTemplate(templateSlug);
  if (!template) return false;
  return requiredSlots(template).every((key) => (slots[key] ?? "").trim().length > 0);
}

/**
 * Does this slide need a generated background?
 *
 * The queue asks before spending an image, and the export gate asks before
 * blocking on a missing one. Unknown slugs answer `true`: a template that
 * cannot be resolved should be treated as needing everything, not as needing
 * nothing.
 */
export function templateUsesBackground(templateSlug: string): boolean {
  return getTemplate(templateSlug)?.usesBackground !== false;
}

/**
 * Does this slide composite a client product?
 *
 * Asked by the product picker, by the copy generator (so the piece is ABOUT the
 * product rather than merely showing it) and by the export gate. Unknown slugs
 * answer `false`: an unresolvable template should not invent a requirement that
 * blocks the export forever.
 */
export function templateUsesProduct(templateSlug: string): boolean {
  return getTemplate(templateSlug)?.usesProduct === true;
}

/** Templates that composite a product, for the "what can I use this photo in" question. */
export const PRODUCT_TEMPLATES = TEMPLATES.filter((t) => t.usesProduct === true);
