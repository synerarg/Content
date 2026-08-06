"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  ImageIcon,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  OffscreenSlide,
  SlidePreview,
} from "@/components/render/slide-canvas";
import {
  useRenderAssets,
  type EditorBrand,
} from "@/lib/render/use-render-assets";
import {
  downloadBlob,
  rasterizeSlide,
  readPngDimensions,
  toObjectUrl,
} from "@/lib/export/rasterize";
import { buildCaptionMarkdown, buildZip, slugify, type ZipEntry } from "@/lib/export/zip";
import {
  deleteBatch,
  updatePost,
  updateSlideSlots,
} from "@/app/(app)/contenido/actions";
import {
  useBackgroundQueue,
  type BackgroundStatus,
  type QueueItem,
  type SlideQueueState,
} from "@/lib/batch/use-background-queue";
import { QueueProgress, SlideStatusChip } from "@/components/batch/queue-progress";
import { getTemplate, emptySlots } from "@/templates/registry";
import { FORMATS, type FormatKey } from "@/templates/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type BatchSlide = {
  id: string;
  templateSlug: string;
  format: FormatKey;
  slots: Record<string, string>;
  backgroundPath: string | null;
  backgroundSignedUrl: string | null;
  backgroundBrief: string;
  backgroundStatus: BackgroundStatus;
  backgroundError: string | null;
  backgroundAttempts: number;
};

export type BatchPost = {
  id: string;
  type: "feed" | "story" | "carousel";
  caption: string;
  hashtags: string[];
  cta: string;
  slides: BatchSlide[];
};

const TYPE_LABEL: Record<string, string> = {
  feed: "Feed",
  story: "Historia",
  carousel: "Carrusel",
};

const LONG_SLOTS = new Set(["quote", "subline", "body", "item_1", "item_2", "item_3"]);

export function BatchDetail({
  batchId,
  batchTitle,
  brand,
  posts: initialPosts,
}: {
  batchId: string;
  batchTitle: string;
  brand: EditorBrand;
  posts: BatchPost[];
}) {
  const router = useRouter();
  const { brandTokens, fontCss, ready } = useRenderAssets(brand);

  const [posts, setPosts] = useState(initialPosts);
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  /*
    Which slides have their text fields revealed ON MOBILE.

    Editing is desktop-first by design, but a phone still has to be good for
    review — reading the copy, checking a background, copying a caption. Six
    text inputs per slide in front of that is noise, so on small screens they
    collapse behind a toggle.

    Deliberately CSS-responsive rather than measured: the class is
    `hidden lg:block`, so desktop always shows the fields and the toggle button
    is never rendered there. Server and client render the same markup at every
    width, which a viewport check in state could not promise.
  */
  const [expandedSlides, setExpandedSlides] = useState<Set<string>>(new Set());

  function toggleSlideFields(slideId: string) {
    setExpandedSlides((current) => {
      const next = new Set(current);
      if (next.has(slideId)) next.delete(slideId);
      else next.add(slideId);
      return next;
    });
  }

  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Keyed by slide id so a re-render can tell what is already converted. */
  const objectUrls = useRef<Map<string, string>>(new Map());

  const allSlides = posts.flatMap((post) => post.slides);

  const queue = useBackgroundQueue({
    batchId,
    initialStates: Object.fromEntries(
      initialPosts.flatMap((post) =>
        post.slides.map((slide) => [
          slide.id,
          {
            status: slide.backgroundStatus,
            error: slide.backgroundError,
            attempts: slide.backgroundAttempts,
          } satisfies SlideQueueState,
        ]),
      ),
    ),
    onSlideReady: async (slideId, background) => {
      try {
        const blobUrl = await toObjectUrl(background.signedUrl);
        const previous = objectUrls.current.get(slideId);
        if (previous) URL.revokeObjectURL(previous);
        objectUrls.current.set(slideId, blobUrl);
        setBackgrounds((current) => ({ ...current, [slideId]: blobUrl }));
      } catch {
        // The background is saved either way; only the live preview misses it.
      }
    },
  });

  function queueItemFor(slide: BatchSlide): QueueItem {
    return {
      slideId: slide.id,
      brandId: brand.id,
      backgroundBrief: slide.backgroundBrief,
      format: slide.format,
      templateSlug: slide.templateSlug,
    };
  }

  async function runQueue(slides: BatchSlide[]) {
    const runnable = slides.filter((slide) => slide.backgroundBrief.trim());
    const skipped = slides.length - runnable.length;

    if (runnable.length === 0) {
      toast.error("Ninguna de estas placas tiene descripción de escena.");
      return;
    }
    if (skipped > 0) {
      toast.warning(
        `${skipped} placa(s) sin descripción de escena quedaron afuera.`,
      );
    }

    const result = await queue.start(runnable.map(queueItemFor));
    if (!result) return;

    if (result.cancelled) {
      toast.info("Generación pausada. Lo hecho quedó guardado.");
    } else if (result.failed > 0) {
      toast.error(`${result.failed} fondo(s) fallaron. Podés reintentarlos.`);
    } else {
      toast.success("Todos los fondos están listos.");
    }
    router.refresh();
  }

  /*
    Signed Storage URLs are cross-origin; drawing them would taint the canvas
    and make the PNG export throw. Every one is converted to a same-origin blob
    before it reaches a template.

    Only slides not already converted are fetched, and blob URLs are revoked
    ONLY on unmount — never on re-run. The previous version revoked the whole
    set in its cleanup, which was survivable when this effect re-ran rarely but
    is not now: the queue writes a row per completed slide, and any refresh
    would blank every background already on screen while they were re-fetched
    one at a time.
  */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      for (const post of initialPosts) {
        for (const slide of post.slides) {
          if (!slide.backgroundSignedUrl) continue;
          if (objectUrls.current.has(slide.id)) continue;

          try {
            const url = await toObjectUrl(slide.backgroundSignedUrl);
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            objectUrls.current.set(slide.id, url);
            setBackgrounds((current) => ({ ...current, [slide.id]: url }));
          } catch {
            // A missing background degrades the slide; it must not block the page.
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPosts]);

  // Unmount-only cleanup, kept separate so it does not run when initialPosts
  // changes identity.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function patchSlide(slideId: string, slots: Record<string, string>) {
    setPosts((current) =>
      current.map((post) => ({
        ...post,
        slides: post.slides.map((slide) =>
          slide.id === slideId ? { ...slide, slots } : slide,
        ),
      })),
    );
  }

  async function saveSlots(slideId: string, slots: Record<string, string>) {
    const result = await updateSlideSlots(slideId, slots);
    if (!result.ok) toast.error(result.error);
  }

  async function savePost(postId: string, patch: Partial<BatchPost>) {
    const result = await updatePost(postId, {
      caption: patch.caption,
      hashtags: patch.hashtags,
      cta: patch.cta,
    });
    if (!result.ok) toast.error(result.error);
  }

  /*
    A single slide goes through the same queue as a whole batch.

    One code path rather than two: the old standalone handler had no rate-limit
    backoff, so clicking it twice in quick succession simply failed the second
    one, and it recorded nothing about the failure. Running one item through the
    queue gets the retries, the persisted state and the status chip for free.
  */
  function regenerateOne(slide: BatchSlide) {
    void runQueue([slide]);
  }

  async function copyCaption(post: BatchPost) {
    const tags = post.hashtags.map((t) => `#${t}`).join(" ");
    const text = [post.caption, tags].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Caption copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  }

  async function handleExportZip() {
    if (!ready || !brandTokens) {
      toast.error("Las tipografías todavía se están cargando.");
      return;
    }

    setExporting(true);
    const entries: ZipEntry[] = [];
    const batchSlug = slugify(batchTitle, "lote");

    try {
      let done = 0;
      const total = posts.reduce((sum, post) => sum + post.slides.length, 0);

      for (const [postIndex, post] of posts.entries()) {
        const folder = `${batchSlug}/${String(postIndex + 1).padStart(2, "0")}-${post.type}`;

        for (const [slideIndex, slide] of post.slides.entries()) {
          const node = slideRefs.current[slide.id];
          if (!node) continue;

          done++;
          setProgress(`Renderizando ${done}/${total}…`);

          const spec = FORMATS[slide.format];
          const blob = await rasterizeSlide({
            node,
            width: spec.width,
            height: spec.height,
            fontCss,
            fonts: brand.fonts,
          });

          const dims = await readPngDimensions(blob);
          if (dims.width !== spec.width || dims.height !== spec.height) {
            throw new Error(
              `Una placa salió en ${dims.width}x${dims.height} en lugar de ${spec.width}x${spec.height}.`,
            );
          }

          entries.push({
            path: `${folder}/${String(slideIndex + 1).padStart(2, "0")}.png`,
            blob,
          });
        }

        entries.push({
          path: `${folder}/caption.md`,
          text: buildCaptionMarkdown({
            batchTitle,
            brandName: brand.name,
            postIndex,
            postType: TYPE_LABEL[post.type] ?? post.type,
            caption: post.caption,
            hashtags: post.hashtags,
            cta: post.cta,
            slideCount: post.slides.length,
          }),
        });
      }

      setProgress("Armando el ZIP…");
      const zip = await buildZip(entries);
      downloadBlob(zip, `${batchSlug}.zip`);
      toast.success(
        `ZIP listo: ${entries.filter((e) => "blob" in e).length} imágenes.`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falló la exportación.");
    } finally {
      setExporting(false);
      setProgress("");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar el lote "${batchTitle}" con todas sus piezas?`)) {
      return;
    }
    const result = await deleteBatch(batchId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lote eliminado.");
    router.push("/contenido");
    router.refresh();
  }

  const totalSlides = posts.reduce((sum, post) => sum + post.slides.length, 0);

  return (
    <div className="space-y-8 px-6 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="text-sm">
          <span className="font-medium">{posts.length} piezas</span>
          <span className="text-muted-foreground"> · {totalSlides} placas</span>
          {!ready ? (
            <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Cargando tipografías
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="size-4" />
            Eliminar
          </Button>
          <Button
            onClick={handleExportZip}
            disabled={exporting || !ready || queue.running}
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Package className="size-4" />
            )}
            {exporting ? progress || "Exportando…" : "Descargar ZIP"}
          </Button>
        </div>
      </div>

      <QueueProgress
        states={allSlides.map(
          (slide) =>
            queue.states[slide.id] ?? {
              status: slide.backgroundStatus,
              error: slide.backgroundError,
              attempts: slide.backgroundAttempts,
            },
        )}
        running={queue.running}
        waitingUntil={queue.waitingUntil}
        etaMs={queue.etaMs}
        onStart={() =>
          runQueue(
            allSlides.filter(
              (slide) => (queue.states[slide.id]?.status ?? "pending") !== "ready",
            ),
          )
        }
        onPause={queue.pause}
        onRetryFailed={() =>
          runQueue(
            allSlides.filter(
              (slide) => queue.states[slide.id]?.status === "failed",
            ),
          )
        }
      />

      {exporting ? (
        <p className="text-xs text-muted-foreground">
          Dejá esta pestaña visible hasta que termine. El render usa
          requestAnimationFrame, que el navegador congela en pestañas de fondo.
        </p>
      ) : null}

      {posts.map((post, postIndex) => (
        <section key={post.id} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              {String(postIndex + 1).padStart(2, "0")} ·{" "}
              {TYPE_LABEL[post.type] ?? post.type}
            </span>
            <span className="text-xs text-muted-foreground">
              {post.slides.length} placa{post.slides.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              {post.slides.map((slide) => {
                const template = getTemplate(slide.templateSlug);
                if (!template || !brandTokens) return null;

                const state = queue.states[slide.id] ?? {
                  status: slide.backgroundStatus,
                  error: slide.backgroundError,
                  attempts: slide.backgroundAttempts,
                };
                const busy =
                  state.status === "running" || state.status === "queued";

                return (
                  <div key={slide.id} className="space-y-2">
                    <div className="rounded-xl border border-border p-2">
                      <SlidePreview
                        maxWidth={296}
                        template={template}
                        slots={{ ...emptySlots(template), ...slide.slots }}
                        format={slide.format}
                        brand={brandTokens}
                        backgroundUrl={backgrounds[slide.id] ?? null}
                        fontCss={fontCss}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <SlideStatusChip state={state} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => regenerateOne(slide)}
                        disabled={queue.running || busy}
                      >
                        <ImageIcon className="size-4" />
                        {state.status === "ready" ? "Regenerar" : "Generar"}
                      </Button>
                    </div>

                    {/*
                      The failure reason stays on screen until the slide is
                      retried. "Exhausted balance" and a filtered prompt need
                      completely different responses, and a toast that already
                      disappeared cannot tell you which one happened.
                    */}
                    {state.status === "failed" && state.error ? (
                      <p className="break-words rounded-md border border-destructive/20 px-2 py-1.5 text-[11px] text-destructive">
                        {state.error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="space-y-6">
              {post.slides.map((slide, slideIndex) => {
                const template = getTemplate(slide.templateSlug);
                if (!template) return null;
                const merged = { ...emptySlots(template), ...slide.slots };

                const expanded = expandedSlides.has(slide.id);

                return (
                  <div key={slide.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Placa {slideIndex + 1} · {template.name} ·{" "}
                        {FORMATS[slide.format].label}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="lg:hidden"
                        aria-expanded={expanded}
                        aria-controls={`${slide.id}-fields`}
                        onClick={() => toggleSlideFields(slide.id)}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            expanded && "rotate-180",
                          )}
                        />
                        {expanded ? "Ocultar textos" : "Editar textos"}
                      </Button>
                    </div>

                    <div
                      id={`${slide.id}-fields`}
                      className={cn(
                        "space-y-3",
                        !expanded && "hidden lg:block",
                      )}
                    >
                      {Object.keys(emptySlots(template)).map((key) => (
                        <div key={key} className="space-y-1.5">
                          <Label
                            htmlFor={`${slide.id}-${key}`}
                            className="text-xs capitalize"
                          >
                            {key.replace(/_/g, " ")}
                          </Label>
                          {LONG_SLOTS.has(key) ? (
                            <Textarea
                              id={`${slide.id}-${key}`}
                              rows={2}
                              value={merged[key] ?? ""}
                              onChange={(event) =>
                                patchSlide(slide.id, {
                                  ...merged,
                                  [key]: event.target.value,
                                })
                              }
                              onBlur={() => saveSlots(slide.id, merged)}
                            />
                          ) : (
                            <Input
                              id={`${slide.id}-${key}`}
                              value={merged[key] ?? ""}
                              onChange={(event) =>
                                patchSlide(slide.id, {
                                  ...merged,
                                  [key]: event.target.value,
                                })
                              }
                              onBlur={() => saveSlots(slide.id, merged)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`caption-${post.id}`} className="text-xs">
                    Caption
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCaption(post)}
                  >
                    <Copy className="size-4" />
                    Copiar
                  </Button>
                </div>
                <Textarea
                  id={`caption-${post.id}`}
                  rows={5}
                  value={post.caption}
                  onChange={(event) =>
                    setPosts((current) =>
                      current.map((p) =>
                        p.id === post.id
                          ? { ...p, caption: event.target.value }
                          : p,
                      ),
                    )
                  }
                  onBlur={() => savePost(post.id, post)}
                />

                <div className="space-y-1.5">
                  <Label htmlFor={`tags-${post.id}`} className="text-xs">
                    Hashtags
                  </Label>
                  <Input
                    id={`tags-${post.id}`}
                    value={post.hashtags.join(" ")}
                    onChange={(event) =>
                      setPosts((current) =>
                        current.map((p) =>
                          p.id === post.id
                            ? {
                                ...p,
                                hashtags: event.target.value
                                  .split(/\s+/)
                                  .map((t) => t.replace(/^#/, ""))
                                  .filter(Boolean),
                              }
                            : p,
                        ),
                      )
                    }
                    onBlur={() => savePost(post.id, post)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/*
        Every slide is mounted offscreen at full resolution so the ZIP export can
        rasterize each one through the exact component the preview uses. Kept
        always-mounted rather than swapped in one at a time: refs are then ready
        the moment export starts, with no render-and-wait dance per slide.
      */}
      {brandTokens
        ? posts.flatMap((post) =>
            post.slides.map((slide) => {
              const template = getTemplate(slide.templateSlug);
              if (!template) return null;
              return (
                <OffscreenSlide
                  key={`off-${slide.id}`}
                  ref={(node) => {
                    slideRefs.current[slide.id] = node;
                  }}
                  template={template}
                  slots={{ ...emptySlots(template), ...slide.slots }}
                  format={slide.format}
                  brand={brandTokens}
                  backgroundUrl={backgrounds[slide.id] ?? null}
                  fontCss={fontCss}
                />
              );
            }),
          )
        : null}
    </div>
  );
}
