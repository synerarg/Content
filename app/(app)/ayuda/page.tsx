import type { Metadata } from "next";
import Link from "next/link";
import {
  FileDown,
  ImageIcon,
  LayoutGrid,
  Palette,
  PencilLine,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = {
  title: "Ayuda",
  description: "Cómo funciona Synera Content Studio, atajos y preguntas frecuentes.",
};

/*
  Contextual help lives next to the doubt — tooltips on the odd fields, empty
  states that teach the next step. This page is the reference for the two things
  that have no natural home: the shape of the whole workflow, and the answers to
  questions that only come up once ("¿por qué las imágenes no tienen texto?").

  Deliberately not an onboarding tour. Nobody remembers a tour, and it blocks
  the thing you opened the app to do.
*/

const STEPS = [
  {
    icon: Palette,
    title: "1. Cargá la marca",
    body: "Paleta, tipografías, tono y dirección de arte. Es lo que después alimenta tanto lo que se escribe como lo que se renderiza. Sin paleta, tipografías y dirección de arte no se puede generar: el botón te lo va a decir.",
    href: "/marcas",
    hrefLabel: "Ir a Marcas",
  },
  {
    icon: LayoutGrid,
    title: "2. Pedí un lote",
    body: "Elegís la composición — por ejemplo un carrusel de 4, un feed y tres historias — y escribís un brief. Claude escribe todas las piezas en una sola llamada, cada una con un ángulo distinto del mismo tema.",
    href: "/contenido",
    hrefLabel: "Ir a Contenido",
  },
  {
    icon: PencilLine,
    title: "3. Revisá el texto",
    body: "Corregí lo que haga falta antes de generar imágenes. Se guarda solo, dos segundos después de que dejás de escribir. Conviene hacerlo en este orden: los fondos tardan varios minutos y no querés generarlos sobre textos que vas a cambiar.",
  },
  {
    icon: ImageIcon,
    title: "4. Generá los fondos",
    body: "Un botón para todo el lote. La cola va de a una imagen y se frena sola cuando la API pone límite; podés pausar, reintentar las que fallen, y volver a una versión anterior si la nueva salió peor.",
  },
  {
    icon: FileDown,
    title: "5. Exportá",
    body: "Un ZIP con todas las placas en PNG a tamaño real y un archivo de texto por pieza con su caption y hashtags. El export se bloquea si alguna placa está sin fondo o con textos obligatorios vacíos.",
  },
];

const FAQ = [
  {
    q: "¿Por qué las imágenes generadas no tienen texto?",
    a: "Porque el texto lo pone el código, no el modelo de imagen. Un modelo de imagen escribe mal, con tipografías que no son las de la marca y sin respetar los límites del diseño. Acá el modelo genera SOLO el fondo y las plantillas dibujan el texto encima con la paleta y las tipografías reales del cliente. Es también la razón de que el PNG exportado sea idéntico al preview: es el mismo componente.",
  },
  {
    q: "¿Por qué tarda tanto generar los fondos?",
    a: "La capa gratuita del proveedor de imágenes hace alrededor de dos por minuto. Ocho placas son unos cuatro minutos y no hay forma de acelerarlo sin pasar a un plan pago. La cola se autorregula: corre a fondo y sólo frena cuando la API se lo pide.",
  },
  {
    q: "Cerré la pestaña en medio de la generación. ¿Perdí todo?",
    a: "No. Cada fondo se guarda apenas se genera y el estado de cada placa vive en la base. Al volver al lote seguís desde donde estaba. Cerrar la pestaña pausa, no cancela.",
  },
  {
    q: "Regeneré un fondo y me gustaba más el anterior.",
    a: "Está guardado. Debajo de cada placa hay 'Versiones anteriores' con los últimos cinco intentos, y volvés a cualquiera con un clic. Vale la pena saberlo porque la generación de imágenes no es determinista: volver a generar no devuelve la misma imagen.",
  },
  {
    q: "¿Qué pasa si borro un lote sin querer?",
    a: "El aviso que aparece después tiene un botón Deshacer. Y aunque se te pase, el lote no se elimina de verdad: queda oculto y se puede recuperar.",
  },
  {
    q: "¿Para qué sirve cargar el historial publicado de una marca?",
    a: "Para que el generador no se repita. Sin esa información vuelve a los mismos argumentos una y otra vez: en las pruebas escribió el mismo titular tres veces seguidas sobre un tema que la marca ya había publicado. Con el historial cargado y analizado, esos ángulos quedan prohibidos.",
  },
  {
    q: "¿Cuánto cuesta cada generación?",
    a: "Está en Configuración: total, últimos 30 días, por tipo y por marca, más las últimas llamadas con su costo. Son estimaciones calculadas con la tarifa vigente el día de cada llamada, no reemplazan la factura del proveedor.",
  },
];

export default function AyudaPage() {
  return (
    <>
      <PageHeader
        title="Ayuda"
        description="Cómo funciona, qué atajos hay y las preguntas que suelen aparecer."
      />

      <div className="space-y-10 px-6 py-8 md:px-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            El flujo, en cinco pasos
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, body, href, hrefLabel }) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-border bg-card glass-card p-4"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklch,var(--synera-accent)_22%,transparent)] bg-background">
                  <Icon className="size-4 text-[var(--synera-accent)]" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-block text-sm text-[var(--synera-accent)] underline-offset-4 hover:underline"
                    >
                      {hrefLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Atajos</h2>
          <p className="text-sm text-muted-foreground">
            Dentro de un lote, apretá{" "}
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs">
              ?
            </kbd>{" "}
            para ver la lista completa. Ninguno se dispara mientras escribís en
            un campo, salvo guardar y generar.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Preguntas frecuentes
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group p-4">
                <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                  {q}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
