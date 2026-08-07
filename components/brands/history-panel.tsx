"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deletePublishedPost,
  importPublishedPosts,
} from "@/app/(app)/marcas/actions";
import { splitPastedCaptions } from "@/lib/history";
import type { HistoryAnalysis } from "@/lib/ai/analyze-history";
import { formatDateTime, formatRelative } from "@/lib/format";
import { notifyError, readErrorPayload } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PublishedPost = {
  id: string;
  caption: string;
  source: string;
  publishedAt: string | null;
  createdAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Pegado a mano",
  instagram: "Instagram",
  meta_ads: "Meta Ads",
};

export function HistoryPanel({
  brandId,
  posts,
  analysis,
  analysedAt,
}: {
  brandId: string;
  posts: PublishedPost[];
  analysis: HistoryAnalysis | null;
  analysedAt: string | null;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [indexing, setIndexing] = useState(false);

  const detected = splitPastedCaptions(raw).length;

  // The analysis describes the posts as they were when it ran. Anything added
  // since is not reflected in the prohibitions the generator receives, and
  // saying so is cheaper than silently generating against a stale list.
  const stale =
    analysis !== null &&
    analysedAt !== null &&
    posts.some((post) => post.createdAt > analysedAt);

  async function handleImport() {
    if (detected === 0) {
      toast.error("Pegá al menos un caption.");
      return;
    }

    setImporting(true);
    const result = await importPublishedPosts(brandId, raw);
    setImporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setRaw("");
    const parts = [`${result.imported} agregados`];
    if (result.duplicates > 0) parts.push(`${result.duplicates} ya estaban`);
    toast.success(parts.join(", ") + ".");
    router.refresh();
  }

  async function handleAnalyse() {
    setAnalysing(true);
    try {
      const res = await fetch("/api/analyze/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) {
        notifyError(null, {
          payload: await readErrorPayload(res),
          retry: handleAnalyse,
        });
        return;
      }

      const payload = await res.json();
      toast.success(
        `${payload.analysis.angles.length} ángulos detectados sobre ${payload.captionCount} posts.`,
      );
      router.refresh();
    } catch (cause) {
      notifyError(cause, { retry: handleAnalyse });
    } finally {
      setAnalysing(false);
    }
  }

  async function handleIndex() {
    setIndexing(true);
    try {
      const res = await fetch("/api/analyze/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });

      if (!res.ok) {
        notifyError(null, { payload: await readErrorPayload(res), retry: handleIndex });
        return;
      }

      const payload = await res.json();
      const total = (payload.published ?? 0) + (payload.generated ?? 0);

      // "Nothing to do" is a success worth saying out loud: pressing the button
      // twice should read as done, not as broken.
      toast.success(
        total === 0
          ? "Ya estaba todo indexado."
          : `${total} textos indexados (${payload.published} publicados, ${payload.generated} generados).`,
      );
      for (const message of payload.errors ?? []) toast.warning(message);
    } catch (cause) {
      notifyError(cause, { retry: handleIndex });
    } finally {
      setIndexing(false);
    }
  }

  async function handleDelete(postId: string) {
    const result = await deletePublishedPost(postId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8 px-6 py-8 md:px-8">
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-[var(--synera-accent)]" />
          <h2 className="text-sm font-semibold">Importar contenido publicado</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="history-paste">
            Pegá los captions, separados por una línea en blanco
          </Label>
          <Textarea
            id="history-paste"
            rows={8}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={
              "¿Y tu negocio todavía no tiene página web? …\n\nDejá de adivinar con tu presupuesto de Google Ads. …"
            }
          />
          <p className="text-xs text-muted-foreground">
            {detected > 0
              ? `${detected} caption${detected === 1 ? "" : "s"} detectado${detected === 1 ? "" : "s"}.`
              : "Cada bloque separado por una línea en blanco cuenta como un post."}{" "}
            Los repetidos se descartan solos.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={handleImport}
          disabled={importing || detected === 0}
        >
          {importing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Importar {detected > 0 ? detected : ""}
        </Button>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Ángulos ya usados</h2>
            <p className="text-xs text-muted-foreground">
              {analysedAt
                ? `Analizado el ${formatDateTime(analysedAt)} sobre ${posts.length} posts.`
                : "Todavía no se analizó este historial."}
            </p>
          </div>

          {/*
            Grouped, or `justify-between` on the parent would push them to
            opposite ends of the row.

            Indexing is separate from the angle analysis, and both are worth
            having: the analysis names angles so the generator can be told to
            avoid them BEFORE writing, and the index catches a repeat the model
            produced anyway. One is a prohibition, the other is a check.
          */}
          <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleIndex}
            disabled={indexing || posts.length === 0}
          >
            {indexing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Fingerprint className="size-4" />
            )}
            {indexing ? "Indexando…" : "Indexar para duplicados"}
          </Button>

          <Button
            onClick={handleAnalyse}
            disabled={analysing || posts.length === 0}
          >
            {analysing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {analysing
              ? "Analizando…"
              : analysis
                ? "Volver a analizar"
                : "Analizar historial"}
          </Button>
          </div>
        </div>

        {stale ? (
          <p className="rounded-lg border border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] px-3 py-2 text-xs text-muted-foreground">
            Agregaste posts después del último análisis. Volvé a analizar para
            que el generador los tenga en cuenta.
          </p>
        ) : null}

        {analysis && analysis.angles.length > 0 ? (
          <div className="space-y-4">
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {analysis.angles.map((angle) => (
                <div key={angle.slug} className="space-y-1 p-4">
                  <p className="font-mono text-xs text-[var(--synera-accent)]">
                    {angle.slug}
                  </p>
                  <p className="text-sm">{angle.gist}</p>
                </div>
              ))}
            </div>

            {analysis.hooks.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  Ganchos gastados
                </h3>
                <ul className="space-y-1">
                  {analysis.hooks.map((hook) => (
                    <li key={hook} className="text-sm text-muted-foreground">
                      · {hook}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Cada lote nuevo se genera con estos ángulos prohibidos. Sin ellos,
              el modelo vuelve a los mismos argumentos: en las pruebas repitió
              tres veces seguidas el mismo titular.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {posts.length === 0
              ? "Importá contenido publicado para poder analizarlo."
              : "Analizá el historial para que los lotes dejen de repetir ángulos."}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Contenido cargado ({posts.length})
        </h2>

        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay nada cargado.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {posts.map((post) => (
              <div key={post.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {post.caption.length > 220
                      ? `${post.caption.slice(0, 220)}…`
                      : post.caption}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {SOURCE_LABEL[post.source] ?? post.source} ·{" "}
                    {formatRelative(post.publishedAt ?? post.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar del historial"
                  onClick={() => handleDelete(post.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
