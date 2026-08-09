import { notFound } from "next/navigation";
import Link from "next/link";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";

/*
  The design preview. DEV ONLY, and guarded twice.

  WHY IT EXISTS. Every screen in this app sits behind Google OAuth, so nobody
  working through an agent session can see one. That is not a small
  inconvenience: it is the reason HANDOFF says "verified by measurement, not by
  eye" in three separate places, and the reason four templates shipped that no
  human has looked at. Measuring geometry catches clipping; it says nothing
  about whether a screen is any good. This route makes the real components
  visible with fixture data, no session required.

  WHY TWO GUARDS. An unauthenticated route that renders application chrome is
  exactly the kind of thing that is fine for months and then is not. One guard
  is a single edit away from being wrong, so:

    1. HERE: `notFound()` when NODE_ENV is production. A Vercel build — preview
       deployments included — is always production, so this 404s everywhere
       except a local `next dev`.
    2. lib/supabase/middleware.ts: `/preview` is added to the public prefixes
       only under the same condition. In production the middleware redirects it
       to /login before this file is ever reached.

  Neither depends on the other being right, and they fail in the same
  direction: locked.

  WHAT IT CANNOT SHOW. Typography. `previewBrand.fonts` is empty on purpose —
  the real path fetches each .woff2 from Storage and a fake path would 404 on
  every render — so everything here falls back to the system face. Judge
  layout, hierarchy, colour and state from this; judge type from the real app.
*/

const SURFACES = [
  { href: "/preview/contenido", label: "Lote", hint: "Donde más tiempo se pasa" },
  { href: "/preview/marca", label: "Nueva marca", hint: "El formulario largo" },
  { href: "/preview/plantillas", label: "Plantillas", hint: "Las 14, con copy de muestra" },
];

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex min-h-svh">
      {/* The real shell markup, copied rather than imported: `app/(app)/layout`
          is an async Server Component that calls Supabase and redirects without
          a session, which is the whole thing being worked around here. Keep the
          classes in sync when the shell changes — they are the design. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--synera-accent)] shadow-[0_0_10px_var(--synera-accent)]"
          />
          <span className="text-sm font-semibold tracking-tight">Synera</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>

        <div className="space-y-1 border-t border-border p-3">
          <p className="text-[11px] font-medium text-[var(--synera-accent)]">
            Preview de diseño
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Datos de fixture, sin sesión. No existe en producción.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card/40 px-6 py-2">
          {SURFACES.map((surface) => (
            <Link
              key={surface.href}
              href={surface.href}
              title={surface.hint}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {surface.label}
            </Link>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            las tipografías no cargan acá — ver el comentario en{" "}
            <code className="font-mono">app/preview/layout.tsx</code>
          </span>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
