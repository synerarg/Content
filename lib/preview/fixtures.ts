import type { EditorBrand } from "@/lib/render/use-render-assets";
import type { BatchPost } from "@/components/batch/batch-detail";

/*
  Fixture data for the design preview at /preview.

  DEV ONLY. Nothing here is reachable in a production build — see
  app/preview/layout.tsx and lib/supabase/middleware.ts, which each refuse
  independently.

  Why fixtures rather than a real batch: every screen worth designing sits
  behind Google OAuth, so an agent session cannot see any of them. That is not
  a small inconvenience — it is why HANDOFF says "verified by measurement, not
  by eye" in three separate places, and why four templates shipped that nobody
  has looked at. This file is what makes the screens visible without a session.

  The content is deliberately REALISTIC rather than lorem ipsum. A design
  reviewed against "Lorem ipsum dolor sit" looks fine and then falls apart on a
  real Rioplatense headline with an accented capital and a 140-character
  caption. Two of the pieces below are at their slot's character limit on
  purpose, and one carousel slide is deliberately empty — an unfinished piece is
  a state this screen has to handle and the one nobody designs for.
*/

export const previewBrand: EditorBrand = {
  id: "00000000-0000-0000-0000-0000000000b1",
  name: "Taller Peralta",
  palette: {
    bg: "#0b0d10",
    fg: "#f5f7fa",
    primary: "#84e9ff",
    "on-primary": "#0b0d10",
  },
  typography: {
    display: { family: "Poppins", weight: 700 },
    body: { family: "Poppins", weight: 400 },
  },
  logo_path: null,
  /*
    No fonts, and it matters that this is empty rather than fake.

    `useRenderAssets` fetches each .woff2 from Storage and inlines it as base64.
    A fixture path would 404 on every render and leave the preview retrying
    forever. Empty means the templates fall back to the system face — so the
    preview is honest about typography being the one thing it cannot show
    faithfully.
  */
  fonts: [],
  products: [],
};

export const previewPosts: BatchPost[] = [
  {
    id: "00000000-0000-0000-0000-0000000000p1",
    type: "feed",
    caption:
      "El día que la camioneta no sale, el reparto tampoco sale. Y el cliente espera, y el chofer cobra igual. Sale más caro el día parado que la revisión que lo evita.",
    hashtags: ["flotaschicas", "reparto", "conurbano", "mantenimientovehicular"],
    cta: "Reservá turno",
    scheduledOn: "2026-08-11",
    scheduledTime: "09:30",
    slides: [
      {
        id: "00000000-0000-0000-0000-0000000000s1",
        templateSlug: "before-after",
        format: "feed",
        slots: {
          before: "Tres planillas y un cuaderno",
          after: "Una sola pantalla",
          support: "El seguimiento dejó de depender de que alguien se acuerde.",
          cta: "Ver el caso",
        },
        productId: null,
        backgroundPath: null,
        backgroundSignedUrl: null,
        backgroundBrief:
          "El playón de una distribuidora chica del conurbano a primera hora.",
        backgroundStatus: "ready",
        backgroundError: null,
        backgroundAttempts: 1,
        renderPath: `00000000-0000-0000-0000-0000000000w1/brand/slide/render.png`,
        renderedAt: "2026-08-09T12:00:00.000Z",
        // Matches nothing, so this slide renders the "desactualizado" state —
        // which is the row that has to be legible and never has been seen.
        renderFingerprint: "0000000000000000",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-0000000000p2",
    type: "carousel",
    caption:
      "Cuatro cosas que revisamos antes de que te dejen a pie. Ninguna lleva más de veinte minutos y las cuatro se pagan solas la primera vez que evitan un día parado.",
    hashtags: ["mantenimientopreventivo", "flotas", "tallermecanico"],
    cta: "Pedí tu turno",
    scheduledOn: null,
    scheduledTime: null,
    slides: [
      {
        id: "00000000-0000-0000-0000-0000000000s2",
        templateSlug: "carousel-cover",
        format: "feed",
        slots: {
          headline: "Cuatro cosas que revisamos antes de que te dejen a pie",
          subline: "Ninguna lleva más de veinte minutos.",
          swipe_hint: "Deslizá",
        },
        productId: null,
        backgroundPath: null,
        backgroundSignedUrl: null,
        backgroundBrief: "La fosa de un taller mecánico, camioneta sobre el elevador.",
        backgroundStatus: "ready",
        backgroundError: null,
        backgroundAttempts: 1,
        renderPath: null,
        renderedAt: null,
        renderFingerprint: null,
      },
      {
        id: "00000000-0000-0000-0000-0000000000s3",
        templateSlug: "carousel-body",
        format: "feed",
        slots: {
          step: "01",
          headline: "La correa de distribución",
          body: "Si se corta, no se rompe la correa: se rompe el motor. Es el arreglo más caro que existe y el más fácil de evitar.",
        },
        productId: null,
        backgroundPath: null,
        backgroundSignedUrl: null,
        backgroundBrief: "La fosa de un taller mecánico, camioneta sobre el elevador.",
        backgroundStatus: "failed",
        // A real message, verbatim from a real failure. The failure row is the
        // one place this app has to be clearest and the hardest to see, because
        // reproducing it means burning credit.
        backgroundError:
          "El proveedor se quedó sin crédito. Cargá crédito en el proveedor de imágenes y volvé a intentar.",
        backgroundAttempts: 3,
        renderPath: null,
        renderedAt: null,
        renderFingerprint: null,
      },
      {
        id: "00000000-0000-0000-0000-0000000000s4",
        templateSlug: "carousel-body",
        format: "feed",
        // Deliberately unfinished. The export gate blocks on this and the row
        // has to say why without anyone guessing.
        slots: { step: "02", headline: "", body: "" },
        productId: null,
        backgroundPath: null,
        backgroundSignedUrl: null,
        backgroundBrief: "La fosa de un taller mecánico, camioneta sobre el elevador.",
        backgroundStatus: "pending",
        backgroundError: null,
        backgroundAttempts: 0,
        renderPath: null,
        renderedAt: null,
        renderFingerprint: null,
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-0000000000p3",
    type: "story",
    caption: "Turnos de esta semana: quedan dos.",
    hashtags: ["taller", "turnos"],
    cta: "Escribinos",
    scheduledOn: "2026-08-12",
    scheduledTime: "18:00",
    slides: [
      {
        id: "00000000-0000-0000-0000-0000000000s5",
        templateSlug: "big-number",
        format: "story",
        slots: {
          eyebrow: "Recuperás",
          number: "3 h",
          unit: "por semana",
          support: "Es lo que hoy se te va buscando presupuestos viejos.",
          cta: "Ver cómo",
        },
        productId: null,
        backgroundPath: null,
        backgroundSignedUrl: null,
        backgroundBrief: "Una superficie plana con luz lateral, sin detalle.",
        backgroundStatus: "ready",
        backgroundError: null,
        backgroundAttempts: 1,
        renderPath: null,
        renderedAt: null,
        renderFingerprint: null,
      },
    ],
  },
];
