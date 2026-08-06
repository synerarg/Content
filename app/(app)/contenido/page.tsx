import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Palette, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/app-shell/empty-state";
import { CreateBatchPanel } from "@/components/batch/create-batch-panel";
import { checkBrandReadiness } from "@/lib/brand-readiness";
import { Button } from "@/components/ui/button";

const TYPE_LABEL: Record<string, string> = {
  feed: "Feed",
  story: "Historia",
  carousel: "Carrusel",
};

export const metadata: Metadata = {
  title: "Contenido",
  description:
    "Lotes de contenido: guion, copy, fondos generados y export listo para publicar.",
};

export default async function ContenidoPage() {
  const supabase = await createClient();

  const [{ data: brands }, { data: batches }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name, palette, typography, art_direction")
      .order("name"),
    supabase
      .from("content_batches")
      .select(
        "id, title, brief, status, created_at, brands(name), posts(id, type, slides(background_status))",
      )
      .order("created_at", { ascending: false }),
  ]);

  if (!brands || brands.length === 0) {
    return (
      <>
        <PageHeader
          title="Contenido"
          description="Lotes de contenido: guion, copy, fondos generados y export listo para publicar."
        />
        <EmptyState
          icon={Palette}
          title="Necesitás una marca primero"
          description="Un lote se genera con el tono, la audiencia y la dirección de arte de una marca. Creá una para empezar."
          action={
            <Button asChild>
              <Link href="/marcas/nueva">Crear marca</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Contenido"
        description="Lotes de contenido: guion, copy, fondos generados y export listo para publicar."
        action={
          <Button asChild variant="outline">
            <Link href="/editor">
              <Wand2 className="size-4" />
              Editor de una pieza
            </Link>
          </Button>
        }
      />

      <div className="space-y-8 px-6 py-8 md:px-8">
        {/* Readiness is computed here, on the server, so the panel can block a
            spend before the request instead of reporting a bad result after. */}
        <CreateBatchPanel
          brands={brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
            readiness: checkBrandReadiness(brand),
          }))}
        />

        {batches && batches.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Lotes
            </h2>
            <div className="grid gap-3">
              {batches.map((batch) => {
                const counts = (batch.posts ?? []).reduce<Record<string, number>>(
                  (acc, post) => {
                    acc[post.type] = (acc[post.type] ?? 0) + 1;
                    return acc;
                  },
                  {},
                );

                // Background progress, at a glance. A batch whose copy is
                // written but whose backgrounds are half done looks identical
                // to a finished one without this.
                const slides = (batch.posts ?? []).flatMap(
                  (post) => post.slides ?? [],
                );
                const readySlides = slides.filter(
                  (slide) => slide.background_status === "ready",
                ).length;
                const failedSlides = slides.filter(
                  (slide) => slide.background_status === "failed",
                ).length;

                return (
                  <Link
                    key={batch.id}
                    href={`/contenido/${batch.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-[color-mix(in_oklch,var(--synera-accent)_30%,transparent)]"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium leading-none">{batch.title}</p>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {batch.brands?.name} · {batch.brief}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {Object.entries(counts).map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {count} {TYPE_LABEL[type] ?? type}
                        </span>
                      ))}

                      {slides.length > 0 ? (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                            failedSlides > 0
                              ? "border-destructive/30 text-destructive"
                              : readySlides === slides.length
                                ? "border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] text-[var(--synera-accent)]"
                                : "border-border text-muted-foreground"
                          }`}
                        >
                          {readySlides}/{slides.length} fondos
                          {failedSlides > 0 ? ` · ${failedSlides} error` : ""}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title="Todavía no hay lotes"
            description="Escribí un brief arriba y Claude arma las piezas: guion, copy, plantilla y caption para cada una."
          />
        )}
      </div>
    </>
  );
}
