"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CloudCheck,
  CloudUpload,
  Copy,
  CopyPlus,
  Loader2,
  Eye,
  Package,
  RefreshCw,
  Shuffle,
  TriangleAlert,
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
import { useProductAssets } from "@/lib/render/use-product-assets";
import { checkSlideLegibility } from "@/lib/render/check-legibility";
import type { LegibilityReport } from "@/lib/render/legibility";
import {
  LegibilityChip,
  LegibilityDetails,
} from "@/components/render/legibility-report";
import {
  downloadBlob,
  rasterizeSlide,
  readPngDimensions,
  resetRasterizeCache,
  toObjectUrl,
} from "@/lib/export/rasterize";
import { buildCaptionMarkdown, buildZip, slugify, type ZipEntry } from "@/lib/export/zip";
import { persistSlideRender } from "@/lib/export/persist-render";
import {
  isRenderCurrent,
  renderFingerprint,
  type FingerprintInput,
} from "@/lib/export/render-fingerprint";
import {
  deleteBatch,
  duplicateBatch,
  duplicatePost,
  restoreBatch,
  setPostSchedule,
  setSlideProduct,
  updatePost,
  updateSlideSlots,
} from "@/app/(app)/contenido/actions";
import { SchedulePanel } from "@/components/batch/schedule-panel";
import {
  VariantsDialog,
  type CaptionVariant,
  type VariantsRequest,
} from "@/components/editor/variants-dialog";
import {
  DEFAULT_TIME,
  exportPrefix,
  formatScheduleLabel,
  timeInputValue,
} from "@/lib/schedule";
import { formatDay } from "@/lib/format";
import { BackgroundHistory } from "@/components/batch/background-history";
import {
  useBackgroundQueue,
  type BackgroundStatus,
  type QueueItem,
  type SlideQueueState,
} from "@/lib/batch/use-background-queue";
import { QueueProgress, SlideStatusChip } from "@/components/batch/queue-progress";
import {
  getTemplate,
  emptySlots,
  isSlideTextComplete,
  isSlotRequired,
  slotLabel,
  templateUsesBackground,
  templateUsesProduct,
} from "@/templates/registry";
import { FORMATS, type FormatKey } from "@/templates/types";
import { notifyError } from "@/lib/notify";
import { useAutosave } from "@/lib/use-autosave";
import { useShortcuts, type Shortcut } from "@/lib/shortcuts";
import { ShortcutOverlay } from "@/components/app-shell/shortcut-overlay";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type BatchSlide = {
  id: string;
  templateSlug: string;
  format: FormatKey;
  slots: Record<string, string>;
  /** Which of the brand's products this slide composites, if any. */
  productId: string | null;
  backgroundPath: string | null;
  backgroundSignedUrl: string | null;
  backgroundBrief: string;
  backgroundStatus: BackgroundStatus;
  backgroundError: string | null;
  backgroundAttempts: number;
  /** Where the last persisted PNG of this slide lives, and what it depicts. */
  renderPath: string | null;
  renderedAt: string | null;
  renderFingerprint: string | null;
};

export type BatchPost = {
  id: string;
  type: "feed" | "story" | "carousel";
  caption: string;
  hashtags: string[];
  cta: string;
  /** Calendar day in the agency timezone, or null. Never an instant — migration 0014. */
  scheduledOn: string | null;
  scheduledTime: string | null;
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
  const { byId: productAssets } = useProductAssets(brand.products);

  /**
   * The product this slide composites, resolved to a blob URL.
   *
   * Null for a slide whose template does not use one, and also for a slide
   * whose product was deleted — `slides.product_id` is `on delete set null`,
   * so that path is normal rather than exceptional.
   */
  function productFor(slide: BatchSlide) {
    if (!templateUsesProduct(slide.templateSlug)) return null;
    return slide.productId ? (productAssets[slide.productId] ?? null) : null;
  }

  const [posts, setPosts] = useState(initialPosts);
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [savingRenders, setSavingRenders] = useState(false);
  const [progress, setProgress] = useState("");
  /** Determinate ZIP progress: slides rasterized so far, and the total. */
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [legibility, setLegibility] = useState<Record<string, LegibilityReport>>({});
  const autosave = useAutosave();

  /*
    One dialog for the whole page, not one per slide.

    A batch of eight slides plus their captions would otherwise mount sixteen
    dialogs, each with its own abort controller and its own fetch state, so that
    fifteen of them can be closed. What varies is the request; the dialog is the
    same component either way.
  */
  const [variantsFor, setVariantsFor] = useState<{
    request: VariantsRequest;
    onApplySlots?: (slots: Record<string, string>) => void;
    onApplyCaption?: (variant: CaptionVariant) => void;
  } | null>(null);

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
      productId: slide.productId,
    };
  }

  async function runQueue(slides: BatchSlide[]) {
    // A template that never displays a background must not be sent to the
    // queue: it would cost a paid image and 10-20 seconds for something nothing
    // renders. Filtered before the brief check so a typographic slide with no
    // scene does not get reported as a problem — it isn't one.
    const needsBackground = slides.filter((slide) =>
      templateUsesBackground(slide.templateSlug),
    );
    const runnable = needsBackground.filter((slide) => slide.backgroundBrief.trim());
    const skipped = needsBackground.length - runnable.length;

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
      // The rasterizer remembers which resources it has warmed, keyed by URL.
      // Every one of those URLs has just been revoked, so the entries can only
      // take up room from here.
      resetRasterizeCache();
    };
  }, []);

  /*
    Edits autosave 2s after you stop typing, and immediately on blur.

    Previously they only saved on blur, so closing the tab or navigating away
    mid-field silently discarded it — with nothing on screen to say whether
    anything had been stored. The indicator next to the piece count is the
    other half: it is what makes "did that save?" answerable without guessing.
  */
  const slotSaver = (slideId: string, slots: Record<string, string>) => async () => {
    const result = await updateSlideSlots(slideId, slots);
    if (!result.ok) notifyError(new Error(result.error));
    return result.ok;
  };

  const postSaver = (postId: string, patch: Partial<BatchPost>) => async () => {
    const result = await updatePost(postId, {
      caption: patch.caption,
      hashtags: patch.hashtags,
      cta: patch.cta,
    });
    if (!result.ok) notifyError(new Error(result.error));
    return result.ok;
  };

  /*
    Written straight through instead of autosaved.

    A product is picked from a list, not typed, so there is no stream of
    keystrokes to debounce — and `revalidate: false` on the action keeps this
    from re-running the effect that owns every background blob URL on screen,
    which is the flicker documented in HANDOFF §7.
  */
  /*
    Schedule edits are written straight through, like the product picker: a date
    comes from a picker, not from a stream of keystrokes, so there is nothing to
    debounce. Local state is patched first so the input never fights the user.
  */
  function patchSchedule(
    postId: string,
    scheduledOn: string | null,
    scheduledTime: string | null,
  ) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, scheduledOn, scheduledTime } : post,
      ),
    );
  }

  async function changeSchedule(
    postId: string,
    scheduledOn: string | null,
    scheduledTime: string | null,
  ) {
    // Mirrors the database check constraint, and the action's own guard: no day
    // means no hour. Doing it here too keeps the inputs consistent immediately
    // rather than after a round trip.
    const nextTime = scheduledOn ? scheduledTime : null;
    patchSchedule(postId, scheduledOn, nextTime);

    const result = await setPostSchedule(postId, {
      scheduled_on: scheduledOn,
      scheduled_time: nextTime,
    });
    if (!result.ok) notifyError(new Error(result.error));
  }

  async function changeProduct(slideId: string, productId: string) {
    setPosts((current) =>
      current.map((post) => ({
        ...post,
        slides: post.slides.map((slide) =>
          slide.id === slideId ? { ...slide, productId } : slide,
        ),
      })),
    );

    const result = await setSlideProduct(slideId, productId);
    if (!result.ok) notifyError(new Error(result.error));
  }

  function patchSlide(slideId: string, slots: Record<string, string>) {
    setPosts((current) =>
      current.map((post) => ({
        ...post,
        slides: post.slides.map((slide) =>
          slide.id === slideId ? { ...slide, slots } : slide,
        ),
      })),
    );
    autosave.schedule(`slide:${slideId}`, slotSaver(slideId, slots));
  }

  function patchPost(postId: string, patch: Partial<BatchPost>) {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, ...patch } : post)),
    );
    const next = { ...posts.find((p) => p.id === postId), ...patch } as BatchPost;
    autosave.schedule(`post:${postId}`, postSaver(postId, next));
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

  /*
    ---------------------------------------------------------------------------
    Persisting the rendered placas
    ---------------------------------------------------------------------------

    Separate from the ZIP on purpose. Exporting is "give me the files"; this is
    "make these exist on the server", which is a different intent with a
    different lifetime — the ZIP goes to someone's Downloads folder, a render
    stays reachable by URL for anything that runs later. Folding it into the
    export button would make a download quietly write to Storage, and a button
    that does more than it says is how surprises get shipped.
  */

  /** What this slide's pixels currently depend on. */
  function fingerprintFor(slide: BatchSlide): FingerprintInput | null {
    if (!brandTokens) return null;
    const product = productFor(slide);

    return {
      templateSlug: slide.templateSlug,
      format: slide.format,
      slots: slide.slots,
      backgroundPath: slide.backgroundPath,
      productId: slide.productId,
      productHasTransparency: product ? product.hasTransparency : null,
      palette: brandTokens.palette,
      displayFamily: brandTokens.displayFamily,
      displayWeight: brandTokens.displayWeight,
      bodyFamily: brandTokens.bodyFamily,
      bodyWeight: brandTokens.bodyWeight,
      logoPath: brand.logo_path,
    };
  }

  /** "guardada" / "desactualizada" / "sin guardar", for the chip. */
  function renderState(slide: BatchSlide): "current" | "stale" | "none" {
    if (!slide.renderPath) return "none";
    const input = fingerprintFor(slide);
    // Without brand tokens the comparison is unanswerable. Saying "stale" then
    // would be a guess shown as a fact, so an existing render is left alone.
    if (!input) return "current";
    return isRenderCurrent(slide.renderFingerprint, renderFingerprint(input))
      ? "current"
      : "stale";
  }

  async function handleSaveRenders() {
    if (!ready || !brandTokens) {
      toast.error("Las tipografías todavía se están cargando.");
      return;
    }

    setSavingRenders(true);
    const startedAt = Date.now();

    try {
      const slides = posts.flatMap((post) => post.slides);
      let done = 0;
      let saved = 0;
      let bytes = 0;
      setExportProgress({ done: 0, total: slides.length });

      for (const slide of slides) {
        const node = slideRefs.current[slide.id];
        const input = fingerprintFor(slide);
        if (!node || !input) continue;

        done++;
        setProgress(`Guardando ${done}/${slides.length}…`);
        setExportProgress({ done, total: slides.length });

        // Skip what is already stored and still current. Re-rendering an
        // unchanged placa costs the slowest operation in the app and produces
        // an identical file under a new name.
        if (renderState(slide) === "current") continue;

        const spec = FORMATS[slide.format];
        const blob = await rasterizeSlide({
          node,
          width: spec.width,
          height: spec.height,
          fontCss,
          fonts: brand.fonts,
        });

        const result = await persistSlideRender({
          slideId: slide.id,
          brandId: brand.id,
          blob,
          expected: { width: spec.width, height: spec.height },
          fingerprintInput: input,
        });

        saved++;
        bytes += result.bytes;

        // Local state, not a revalidate: the page holds every background as a
        // blob URL keyed by slide id and a refresh would tear those down.
        setPosts((current) =>
          current.map((post) => ({
            ...post,
            slides: post.slides.map((s) =>
              s.id === slide.id
                ? {
                    ...s,
                    renderPath: result.path,
                    renderFingerprint: result.fingerprint,
                    renderedAt: new Date().toISOString(),
                  }
                : s,
            ),
          })),
        );
      }

      const seconds = (Date.now() - startedAt) / 1000;
      toast.success(
        saved === 0
          ? "Todas las placas ya estaban guardadas y al día."
          : `${saved} ${saved === 1 ? "placa guardada" : "placas guardadas"} · ${(bytes / 1_048_576).toFixed(1)} MB · ${seconds.toFixed(1)}s`,
      );
    } catch (cause) {
      notifyError(cause, { retry: handleSaveRenders });
    } finally {
      setSavingRenders(false);
      setProgress("");
      setExportProgress({ done: 0, total: 0 });
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
    // Reported in the success toast. Rasterization is the slowest thing this
    // app does and it cannot be profiled from a session, so the number has to
    // reach whoever can compare it.
    const startedAt = Date.now();

    try {
      let done = 0;
      const total = posts.reduce((sum, post) => sum + post.slides.length, 0);
      setExportProgress({ done: 0, total });

      for (const [postIndex, post] of posts.entries()) {
        /*
          Date first, so the extracted folder sorts in publishing order — which
          is the order whoever posts it works through. Unscheduled pieces get
          `sin-fecha`, which sorts after every date and groups them at the end
          instead of scattering them through the plan.
        */
        const folder = `${batchSlug}/${exportPrefix(post.scheduledOn)}-${String(
          postIndex + 1,
        ).padStart(2, "0")}-${post.type}`;

        for (const [slideIndex, slide] of post.slides.entries()) {
          const node = slideRefs.current[slide.id];
          if (!node) continue;

          done++;
          setProgress(`Renderizando ${done}/${total}…`);
          setExportProgress({ done, total });

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
            scheduleLabel: formatScheduleLabel(post.scheduledOn, post.scheduledTime),
          }),
        });
      }

      setProgress("Armando el ZIP…");
      const zip = await buildZip(entries);
      downloadBlob(zip, `${batchSlug}.zip`);
      const images = entries.filter((e) => "blob" in e).length;
      const seconds = (Date.now() - startedAt) / 1000;
      toast.success(
        `ZIP listo: ${images} imágenes en ${seconds.toFixed(1)}s (${(seconds / Math.max(1, images)).toFixed(1)}s por placa).`,
      );
    } catch (cause) {
      notifyError(cause, { retry: handleExportZip });
    } finally {
      setExporting(false);
      setProgress("");
      setExportProgress({ done: 0, total: 0 });
    }
  }

  /*
    Every slide in one pass, sequentially.

    Not in parallel: each check rasterizes the same document, and running eight
    at once means eight simultaneous html-to-image passes competing for the main
    thread — slower overall, and it makes the page unresponsive while it runs.
    At a quarter scale each one is fast enough that the loop is not the problem.
  */
  async function handleCheckLegibility() {
    if (!ready) {
      toast.error("Esperá a que terminen de cargar las tipografías.");
      return;
    }

    setChecking(true);
    const next: Record<string, LegibilityReport> = {};

    try {
      for (const slide of allSlides) {
        const node = slideRefs.current[slide.id];
        if (!node) continue;

        const spec = FORMATS[slide.format];
        next[slide.id] = await checkSlideLegibility({
          node,
          width: spec.width,
          height: spec.height,
          fontCss,
          fonts: brand.fonts,
        });
      }

      setLegibility(next);

      const failing = Object.values(next).filter(
        (report) => !report.ok && !report.empty,
      ).length;

      if (failing === 0) {
        toast.success("Todas las placas se leen bien sobre su fondo.");
      } else {
        toast.warning(
          `${failing} placa${failing === 1 ? "" : "s"} con poco contraste. Están marcadas abajo.`,
        );
      }
    } catch (cause) {
      // Whatever was measured before the failure is kept: a partial answer on
      // six of eight slides is worth more than none.
      setLegibility(next);
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo revisar la legibilidad.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);

    /*
      Only the FAILURE path resets the flag, and that is deliberate here: the
      success path navigates away, so clearing it would flash the button back to
      "Eliminar" for a frame on a batch that is already gone. A throw is a
      failure, so it resets too.
    */
    let result: Awaited<ReturnType<typeof deleteBatch>>;
    try {
      result = await deleteBatch(batchId);
    } catch (cause) {
      setDeleting(false);
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo eliminar el lote.",
      );
      return;
    }

    if (!result.ok) {
      setDeleting(false);
      toast.error(result.error);
      return;
    }
    /*
      Soft-deleted, so this is genuinely reversible for as long as the toast is
      up — and in fact for longer, since nothing purges the row. The 8 s window
      is how long the offer stays visible, not how long the data survives.
    */
    toast.success("Lote eliminado.", {
      duration: 8000,
      action: {
        label: "Deshacer",
        onClick: async () => {
          const undone = await restoreBatch(batchId);
          if (!undone.ok) {
            notifyError(new Error(undone.error));
            return;
          }
          toast.success("Lote restaurado.");
          router.push(`/contenido/${batchId}`);
          router.refresh();
        },
      },
    });

    setConfirmDelete(false);
    router.push("/contenido");
    router.refresh();
  }

  const totalSlides = posts.reduce((sum, post) => sum + post.slides.length, 0);

  /*
    Why the export is gated.

    Rasterizing a slide with no background, or with an empty required text
    slot, does not fail — it produces a perfectly valid PNG with a hole in it.
    That is exactly the kind of thing that reaches a client before anyone
    notices, so the button says what is missing instead of letting it through.
  */
  const incomplete = allSlides.filter((slide) => {
    if (!isSlideTextComplete(slide.templateSlug, slide.slots)) return true;

    // Same reasoning as a missing background, and a worse-looking hole: a
    // product template with no product rasterizes into a dashed empty box where
    // the product should be.
    if (templateUsesProduct(slide.templateSlug) && !productFor(slide)) return true;

    // A template that does not use one is complete without it.
    if (!templateUsesBackground(slide.templateSlug)) return false;

    const status = queue.states[slide.id]?.status ?? slide.backgroundStatus;
    return !(status === "ready" || Boolean(backgrounds[slide.id]));
  });

  const missingProduct = incomplete.some(
    (slide) => templateUsesProduct(slide.templateSlug) && !productFor(slide),
  );

  const exportBlockedReason =
    !ready
      ? "Esperá a que terminen de cargar las tipografías."
      : queue.running
        ? "Esperá a que termine de generar los fondos."
        : incomplete.length > 0
          ? `${incomplete.length} placa${incomplete.length === 1 ? "" : "s"} ${
              missingProduct
                ? "sin producto, sin fondo o con textos obligatorios vacíos."
                : "sin fondo o con textos obligatorios vacíos."
            }`
          : null;

  /*
    Registered here rather than app-wide: every one of these acts on THIS
    batch, and a shortcut that silently does nothing on four of five screens
    teaches people not to trust any of them.
  */
  const shortcuts: Shortcut[] = [
    {
      key: "s",
      mod: true,
      whileTyping: true,
      label: "Guardar ahora",
      description: "Fuerza el autoguardado sin esperar los 2 segundos",
      run: () => autosave.flushAll(),
    },
    {
      key: "Enter",
      mod: true,
      whileTyping: true,
      label: "Generar fondos",
      description: "Arranca la cola con las placas que faltan",
      run: () => {
        if (queue.running) return;
        void runQueue(
          allSlides.filter(
            (slide) => (queue.states[slide.id]?.status ?? "pending") !== "ready",
          ),
        );
      },
    },
    {
      key: "e",
      mod: true,
      label: "Descargar ZIP",
      description: "Exporta el lote si está completo",
      run: () => {
        if (exportBlockedReason === null && !exporting) void handleExportZip();
      },
    },
  ];

  useShortcuts(shortcuts);

  return (
    <div className="space-y-8 px-6 py-8 md:px-8">
      <ShortcutOverlay shortcuts={shortcuts} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar el lote"
        description={
          <>
            Se elimina <span className="text-foreground">{batchTitle}</span> con
            sus {posts.length} piezas y {totalSlides} placas. Vas a poder
            deshacerlo desde el aviso que aparece después.
          </>
        }
        confirmLabel={deleting ? "Eliminando…" : "Eliminar el lote"}
        destructive
        pending={deleting}
        onConfirm={handleDelete}
      />

      {/*
        The batch-level toolbar: actions, the background queue, the schedule
        panel. Deliberately NOT a card — it used to be three stacked
        rounded-xl/border/bg-card boxes that outweighed the pieces below them,
        which is backwards on a screen people stare at all day. One hairline
        at the bottom is enough separation; the weight belongs to the content.
      */}
      <div className="space-y-4 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">{posts.length} piezas</span>
          <span className="text-muted-foreground"> · {totalSlides} placas</span>
          {!ready ? (
            <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Cargando tipografías
            </span>
          ) : null}
          <span className="ml-3">
            <SaveIndicator status={autosave.status} />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const result = await duplicateBatch(batchId);
              if (!result.ok) {
                notifyError(new Error(result.error));
                return;
              }
              toast.success("Lote duplicado.");
              router.push(`/contenido/${result.id}`);
              router.refresh();
            }}
          >
            <CopyPlus className="size-4" />
            Duplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCheckLegibility}
            disabled={checking || exporting || !ready}
            title="Mide el contraste real de cada texto contra los píxeles de su fondo"
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Eye className="size-4" />
            )}
            {checking ? "Midiendo…" : "Revisar legibilidad"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Eliminar
          </Button>
          {/*
            "Guardar" and "Descargar" are two different intents and get two
            buttons. Saving puts the PNGs on the server, where a link, a preview
            or a scheduled publication can reach them; downloading puts them on
            this machine. Same rasterization underneath, different lifetime.
          */}
          <Button
            variant="secondary"
            onClick={handleSaveRenders}
            disabled={savingRenders || exporting || exportBlockedReason !== null}
            title={
              exportBlockedReason ??
              "Guardar el PNG de cada placa en el servidor, para compartir o publicar"
            }
          >
            {savingRenders ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CloudUpload className="size-4" />
            )}
            {savingRenders ? progress || "Guardando…" : "Guardar placas"}
          </Button>
          <Button
            onClick={handleExportZip}
            disabled={exporting || savingRenders || exportBlockedReason !== null}
            title={exportBlockedReason ?? "Descargar todas las placas y captions"}
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

      {/* The tooltip alone is not enough: a disabled button does not fire hover
          on touch, and this is the one place a phone user gets stuck. */}
      {exportBlockedReason && !exporting ? (
        <p className="text-xs text-muted-foreground">
          No se puede exportar todavía: {exportBlockedReason}
        </p>
      ) : null}

      {(exporting || savingRenders) && exportProgress.total > 0 ? (
        <div className="space-y-1.5">
          <div
            className="h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={exportProgress.done}
            aria-valuemin={0}
            aria-valuemax={exportProgress.total}
            aria-label="Placas renderizadas"
          >
            <div
              className="h-full rounded-full bg-[var(--synera-accent)] transition-[width] duration-300"
              style={{
                width: `${Math.round((exportProgress.done / exportProgress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {exportProgress.done}/{exportProgress.total} placas renderizadas
          </p>
        </div>
      ) : null}

      <QueueProgress
        // Only slides that actually take a background are counted. Including a
        // purely typographic one would leave the bar permanently short of 100%
        // and the count reading "5/8 listos" on a batch with nothing left to do.
        states={allSlides
          .filter((slide) => templateUsesBackground(slide.templateSlug))
          .map(
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

      {exporting || savingRenders ? (
        <p className="text-xs text-muted-foreground">
          Dejá esta pestaña visible hasta que termine. El render usa
          requestAnimationFrame, que el navegador congela en pestañas de fondo.
        </p>
      ) : null}

      <SchedulePanel
        batchId={batchId}
        postCount={posts.length}
        scheduledCount={posts.filter((post) => post.scheduledOn).length}
        onScheduled={(assigned, time) => {
          // Patched from the action's own return value rather than refreshed:
          // the page is holding a blob URL per slide and has nothing to re-read.
          const byId = new Map(assigned.map((item) => [item.postId, item.scheduledOn]));
          setPosts((current) =>
            current.map((post) =>
              byId.has(post.id)
                ? { ...post, scheduledOn: byId.get(post.id) ?? null, scheduledTime: time }
                : post,
            ),
          );
        }}
        onCleared={() =>
          setPosts((current) =>
            current.map((post) => ({
              ...post,
              scheduledOn: null,
              scheduledTime: null,
            })),
          )
        }
      />
      </div>

      {posts.map((post, postIndex) => (
        <section
          key={post.id}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              {String(postIndex + 1).padStart(2, "0")} ·{" "}
              {TYPE_LABEL[post.type] ?? post.type}
            </span>
            <span className="text-xs text-muted-foreground">
              {post.slides.length} placa{post.slides.length === 1 ? "" : "s"}
            </span>

            {/*
              Per-piece override of whatever the batch-level distribution did.
              A plan survives contact with a client precisely because one piece
              can move without redoing the other four.
            */}
            <span className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label={`Fecha de la pieza ${postIndex + 1}`}
                value={post.scheduledOn ?? ""}
                onChange={(event) =>
                  changeSchedule(
                    post.id,
                    event.target.value || null,
                    post.scheduledTime ?? DEFAULT_TIME,
                  )
                }
                className="h-8 w-auto"
              />
              <Input
                type="time"
                aria-label={`Hora de la pieza ${postIndex + 1}`}
                value={timeInputValue(post.scheduledTime)}
                disabled={!post.scheduledOn}
                onChange={(event) =>
                  changeSchedule(post.id, post.scheduledOn, event.target.value || null)
                }
                className="h-8 w-auto tabular-nums"
              />
            </span>

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={async () => {
                const result = await duplicatePost(post.id);
                if (!result.ok) {
                  notifyError(new Error(result.error));
                  return;
                }
                toast.success("Pieza duplicada al final del lote.");
                router.refresh();
              }}
            >
              <CopyPlus className="size-4" />
              Duplicar pieza
            </Button>
          </div>

          <div className="space-y-6">
            {post.slides.map((slide, slideIndex) => {
              const template = getTemplate(slide.templateSlug);
              if (!template) return null;

              const merged = { ...emptySlots(template), ...slide.slots };
              const expanded = expandedSlides.has(slide.id);
              const state = queue.states[slide.id] ?? {
                status: slide.backgroundStatus,
                error: slide.backgroundError,
                attempts: slide.backgroundAttempts,
              };
              const busy =
                state.status === "running" || state.status === "queued";

              return (
                <div
                  key={slide.id}
                  className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start"
                >
                  {/* Preview plus everything that reports on its state. One
                      grid item per slide instead of two independently-looping
                      columns — a slide's own preview and its own fields can no
                      longer drift out of alignment when one of them grows
                      taller than the other. */}
                  <div className="space-y-2">
                    {brandTokens ? (
                      <>
                        <div
                          key={backgrounds[slide.id] ? "bg" : "empty"}
                          className="animate-in fade-in-0 duration-500 rounded-xl border border-border p-2"
                        >
                          <SlidePreview
                            maxWidth={296}
                            template={template}
                            slots={{ ...emptySlots(template), ...slide.slots }}
                            format={slide.format}
                            brand={brandTokens}
                            backgroundUrl={backgrounds[slide.id] ?? null}
                            product={productFor(slide)}
                            fontCss={fontCss}
                          />
                        </div>

                        {/* A typographic template has no background to generate,
                            so it gets no status chip and no generate button —
                            controls for something that will never happen. */}
                        {templateUsesBackground(slide.templateSlug) ? (
                          <div className="flex items-center justify-between gap-2">
                            <SlideStatusChip state={state} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => regenerateOne(slide)}
                              disabled={queue.running || busy}
                            >
                              <RefreshCw className="size-4" />
                              {state.status === "ready" ? "Regenerar" : "Generar"}
                            </Button>
                          </div>
                        ) : (
                          <p className="px-2 text-[11px] text-muted-foreground">
                            Sin fondo generado — esta plantilla es sólo tipografía.
                          </p>
                        )}

                        {/*
                          The product is chosen when the batch is created, so this is
                          a correction rather than a setup step — but it has to be
                          here, because "wrong product on one piece" is otherwise
                          only fixable by regenerating the whole batch.
                        */}
                        {templateUsesProduct(slide.templateSlug) ? (
                          brand.products.length === 0 ? (
                            <p className="px-2 text-[11px] text-muted-foreground">
                              Esta plantilla necesita un producto y la marca no tiene
                              ninguno cargado.
                            </p>
                          ) : (
                            <Select
                              value={slide.productId ?? ""}
                              onValueChange={(next) => changeProduct(slide.id, next)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Elegí un producto" />
                              </SelectTrigger>
                              <SelectContent>
                                {brand.products.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        ) : null}

                        {/*
                          Status stack: legibility, saved-render state, and a
                          generation failure. These stay in plain sight — a
                          "Detalles" disclosure is for metadata nobody needs to
                          act on, not for the things that say whether this
                          placa is actually finished.
                        */}
                        {legibility[slide.id] ? (
                          <div className="space-y-1.5 px-0.5">
                            <LegibilityChip report={legibility[slide.id]} />
                            {!legibility[slide.id].ok ? (
                              <LegibilityDetails report={legibility[slide.id]} />
                            ) : null}
                          </div>
                        ) : null}

                        {renderState(slide) !== "none" ? (
                          <p
                            className={cn(
                              "flex items-center gap-1.5 px-0.5 text-[11px]",
                              renderState(slide) === "stale"
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {renderState(slide) === "stale" ? (
                              <>
                                <TriangleAlert className="size-3.5 shrink-0" />
                                PNG guardado desactualizado — la placa cambió desde
                                entonces. Volvé a guardar.
                              </>
                            ) : (
                              <>
                                <CloudCheck className="size-3.5 shrink-0" />
                                PNG guardado{" "}
                                {slide.renderedAt
                                  ? `el ${formatDay(slide.renderedAt.slice(0, 10))}`
                                  : ""}
                              </>
                            )}
                          </p>
                        ) : null}

                        {state.status === "failed" && state.error ? (
                          <p className="break-words rounded-md border border-destructive/20 px-2 py-1.5 text-[11px] text-destructive">
                            {state.error}
                          </p>
                        ) : null}

                        {/*
                          Everything secondary in one disclosure instead of two:
                          the scene brief and template slug nobody needs to
                          review a batch, plus older backgrounds — merged here
                          because both were already opt-in on their own.
                        */}
                        <details className="group">
                          <summary className="cursor-pointer list-none px-2 text-[11px] text-muted-foreground marker:content-none hover:text-foreground">
                            Detalles
                          </summary>
                          <div className="mt-2 space-y-3 rounded-lg border border-border p-2">
                            <dl className="space-y-2 text-[11px]">
                              <div>
                                <dt className="text-muted-foreground">Escena pedida</dt>
                                <dd className="break-words">
                                  {slide.backgroundBrief || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Plantilla</dt>
                                <dd className="font-mono">{slide.templateSlug}</dd>
                              </div>
                              {state.attempts > 0 ? (
                                <div>
                                  <dt className="text-muted-foreground">Intentos</dt>
                                  <dd className="tabular-nums">{state.attempts}</dd>
                                </div>
                              ) : null}
                            </dl>

                            {state.status === "ready" ? (
                              <BackgroundHistory
                                slideId={slide.id}
                                currentPath={slide.backgroundPath}
                                onRestored={(path, blobUrl) => {
                                  const previous = objectUrls.current.get(slide.id);
                                  if (previous && previous !== blobUrl) {
                                    URL.revokeObjectURL(previous);
                                  }
                                  objectUrls.current.set(slide.id, blobUrl);
                                  setBackgrounds((current) => ({
                                    ...current,
                                    [slide.id]: blobUrl,
                                  }));
                                  setPosts((current) =>
                                    current.map((p) => ({
                                      ...p,
                                      slides: p.slides.map((s) =>
                                        s.id === slide.id
                                          ? { ...s, backgroundPath: path }
                                          : s,
                                      ),
                                    })),
                                  );
                                }}
                              />
                            ) : null}
                          </div>
                        </details>
                      </>
                    ) : null}
                  </div>

                  {/* This slide's editable text — independent of brandTokens,
                      so typing is never blocked on fonts still loading. */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Placa {slideIndex + 1} · {template.name} ·{" "}
                        {FORMATS[slide.format].label}
                      </p>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVariantsFor({
                            request: {
                              target: "slots",
                              brandId: brand.id,
                              templateSlug: slide.templateSlug,
                              format: slide.format,
                              current: merged,
                              // The background is already generated and is not
                              // regenerated for a copy change, so the options
                              // have to work over the photo that exists.
                              sceneBrief: slide.backgroundBrief || undefined,
                            },
                            onApplySlots: (slots) => {
                              patchSlide(slide.id, slots);
                              toast.success("Texto reemplazado.");
                            },
                          })
                        }
                      >
                        <Shuffle className="size-4" />
                        Variantes
                      </Button>

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
                      {Object.keys(emptySlots(template)).map((key) => {
                        const required = isSlotRequired(template, key);
                        const empty = !merged[key]?.trim();
                        return (
                          <div key={key} className="space-y-1.5">
                            <Label
                              htmlFor={`${slide.id}-${key}`}
                              className="text-xs"
                            >
                              {slotLabel(template, key)}
                              {required ? null : (
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  opcional
                                </span>
                              )}
                            </Label>
                            {LONG_SLOTS.has(key) ? (
                              <Textarea
                                id={`${slide.id}-${key}`}
                                rows={2}
                                aria-invalid={required && empty}
                                value={merged[key] ?? ""}
                                onChange={(event) =>
                                  patchSlide(slide.id, {
                                    ...merged,
                                    [key]: event.target.value,
                                  })
                                }
                                onBlur={() => autosave.flush(`slide:${slide.id}`, slotSaver(slide.id, merged))}
                              />
                            ) : (
                              <Input
                                id={`${slide.id}-${key}`}
                                aria-invalid={required && empty}
                                value={merged[key] ?? ""}
                                onChange={(event) =>
                                  patchSlide(slide.id, {
                                    ...merged,
                                    [key]: event.target.value,
                                  })
                                }
                                onBlur={() => autosave.flush(`slide:${slide.id}`, slotSaver(slide.id, merged))}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`caption-${post.id}`} className="text-xs">
                    Caption
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setVariantsFor({
                          request: {
                            target: "caption",
                            brandId: brand.id,
                            postType: post.type,
                            current: {
                              caption: post.caption,
                              hashtags: post.hashtags,
                              cta: post.cta,
                            },
                            // What the images already say, so the caption
                            // accompanies them instead of repeating them.
                            slideText: post.slides
                              .flatMap((slide) => Object.values(slide.slots))
                              .filter((value) => value.trim())
                              .join(" · "),
                          },
                          onApplyCaption: (variant) => {
                            patchPost(post.id, {
                              caption: variant.caption,
                              hashtags: variant.hashtags,
                              cta: variant.cta,
                            });
                            toast.success("Caption reemplazado.");
                          },
                        })
                      }
                    >
                      <Shuffle className="size-4" />
                      Variantes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCaption(post)}
                    >
                      <Copy className="size-4" />
                      Copiar
                    </Button>
                  </div>
                </div>
                <Textarea
                  id={`caption-${post.id}`}
                  rows={5}
                  value={post.caption}
                  onChange={(event) =>
                    patchPost(post.id, { caption: event.target.value })
                  }
                  onBlur={() =>
                    autosave.flush(`post:${post.id}`, postSaver(post.id, post))
                  }
                />

                <div className="space-y-1.5">
                  <Label htmlFor={`tags-${post.id}`} className="text-xs">
                    Hashtags
                  </Label>
                  <Input
                    id={`tags-${post.id}`}
                    value={post.hashtags.join(" ")}
                    onChange={(event) =>
                      patchPost(post.id, {
                        hashtags: event.target.value
                          .split(/\s+/)
                          .map((t) => t.replace(/^#/, ""))
                          .filter(Boolean),
                      })
                    }
                    onBlur={() =>
                      autosave.flush(`post:${post.id}`, postSaver(post.id, post))
                    }
                  />
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
                  product={productFor(slide)}
                  fontCss={fontCss}
                />
              );
            }),
          )
        : null}

      {variantsFor ? (
        <VariantsDialog
          open
          onOpenChange={(next) => {
            if (!next) setVariantsFor(null);
          }}
          request={variantsFor.request}
          onApplySlots={variantsFor.onApplySlots}
          onApplyCaption={variantsFor.onApplyCaption}
        />
      ) : null}
    </div>
  );
}
