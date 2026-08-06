import type { z } from "zod";
import { BoldHeadline, boldHeadlineSlots } from "./bold-headline";
import { QuoteCard, quoteCardSlots } from "./quote-card";
import { ListTips, listTipsSlots } from "./list-tips";
import { CarouselCover, carouselCoverSlots } from "./carousel-cover";
import { CarouselBody, carouselBodySlots } from "./carousel-body";
import { StoryCta, storyCtaSlots } from "./story-cta";
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
  slotHints: Record<string, string>;
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
    slotHints: {
      headline: "El gancho, corto. La historia se ve dos segundos.",
      subline: "Una línea de contexto. Opcional.",
      cta: "La acción concreta: 'Escribinos por DM', 'Link en bio'.",
    },
    component: StoryCta,
  },
  {
    slug: "carousel-cover",
    name: "Carrusel · tapa",
    description:
      "Primera placa de un carrusel. Promete lo que las siguientes desarrollan.",
    role: "cover",
    formats: ["feed", "story"],
    slots: carouselCoverSlots,
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
