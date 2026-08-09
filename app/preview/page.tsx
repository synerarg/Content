import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";

const SURFACES = [
  {
    href: "/preview/contenido",
    label: "Lote",
    body: "`BatchDetail` con tres piezas: una suelta, un carrusel y una historia. Incluye los estados que nadie diseña — una placa sin terminar, un fondo fallado con su mensaje real, y un PNG guardado que quedó desactualizado.",
  },
  {
    href: "/preview/marca",
    label: "Nueva marca",
    body: "`BrandForm` entero: importar desde el sitio, paleta con contraste en vivo, tipografía, voz y dirección de arte. Es el formulario más largo de la app.",
  },
  {
    href: "/preview/plantillas",
    label: "Plantillas",
    body: "Las 14 plantillas con su copy de muestra, en feed. Cuatro de ellas todavía no las vio nadie.",
  },
];

export default function PreviewIndex() {
  return (
    <>
      <PageHeader
        title="Preview de diseño"
        description="Las pantallas reales con datos de fixture, sin sesión. Sólo existe en desarrollo."
      />

      <div className="grid gap-4 px-6 py-8 sm:grid-cols-2 md:px-8">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-[var(--synera-accent)]/40"
          >
            <h2 className="text-sm font-semibold">{surface.label}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {surface.body}
            </p>
          </Link>
        ))}
      </div>

      <div className="px-6 pb-10 md:px-8">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">
            Lo que acá no se puede juzgar:
          </strong>{" "}
          la tipografía. Las fuentes de marca se bajan de Storage y se incrustan
          como base64; sin sesión no hay de dónde bajarlas, así que todo cae a la
          fuente del sistema. Layout, jerarquía, color y estados sí son fieles.
        </p>
      </div>
    </>
  );
}
