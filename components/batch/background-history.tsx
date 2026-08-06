"use client";

import { useState } from "react";
import { Check, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listSlideBackgrounds,
  setSlideBackground,
  type SlideBackground,
} from "@/app/(app)/contenido/actions";
import { toObjectUrl } from "@/lib/export/rasterize";
import { formatRelative } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/*
  Previous backgrounds for a slide, with one click to go back to any of them.

  Image generation is non-deterministic, so before this a second click on
  "Regenerar" could destroy a better background with no way to recover it —
  "just generate it again" does not return the same image. The last five
  attempts are kept.

  Loaded on demand rather than with the page: signing five URLs per slide for a
  gallery nobody opened would multiply the batch page's cost by the number of
  slides, for nothing.
*/
export function BackgroundHistory({
  slideId,
  currentPath,
  onRestored,
}: {
  slideId: string;
  currentPath: string | null;
  onRestored: (path: string, blobUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SlideBackground[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [restoring, setRestoring] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setLoading(true);
    try {
      const result = await listSlideBackgrounds(slideId);
      if (!result.ok) {
        notifyError(new Error(result.error));
        return;
      }
      setItems(result.items);

      // Signed URLs are cross-origin. Everything the export path touches has to
      // be a blob first, and restoring puts one of these straight onto a slide.
      for (const item of result.items) {
        if (!item.signedUrl) continue;
        try {
          const blobUrl = await toObjectUrl(item.signedUrl);
          setThumbs((current) => ({ ...current, [item.id]: blobUrl }));
        } catch {
          // A thumbnail that will not load is not worth failing the gallery.
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function restore(item: SlideBackground) {
    const blobUrl = thumbs[item.id];
    if (!blobUrl) {
      toast.error("Esa versión todavía no terminó de cargar.");
      return;
    }

    setRestoring(item.id);
    const result = await setSlideBackground(slideId, item.storagePath, {
      prompt: item.prompt,
      seed: item.seed,
      restoredFrom: item.id,
    });
    setRestoring(null);

    if (!result.ok) {
      notifyError(new Error(result.error));
      return;
    }

    onRestored(item.storagePath, blobUrl);
    toast.success("Fondo restaurado.");
    setOpen(false);
  }

  // One attempt is just the current background; there is nothing to go back to.
  const worthShowing = items.length > 1;

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={toggle}
        aria-expanded={open}
      >
        <History className="size-4" />
        {open ? "Ocultar versiones" : "Versiones anteriores"}
      </Button>

      {open ? (
        loading ? (
          <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Buscando versiones…
          </p>
        ) : !worthShowing ? (
          <p className="px-2 text-xs text-muted-foreground">
            Todavía no hay versiones anteriores de esta placa.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => {
              const isCurrent = item.storagePath === currentPath;
              const thumb = thumbs[item.id];

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isCurrent || restoring !== null}
                  onClick={() => restore(item)}
                  title={
                    isCurrent
                      ? "Es el fondo actual"
                      : `Restaurar la versión de ${formatRelative(item.createdAt)}`
                  }
                  className={cn(
                    "relative overflow-hidden rounded-lg border transition-colors",
                    isCurrent
                      ? "border-[color-mix(in_oklch,var(--synera-accent)_45%,transparent)]"
                      : "border-border hover:border-[color-mix(in_oklch,var(--synera-accent)_30%,transparent)]",
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-[4/5] w-full animate-pulse bg-muted" />
                  )}

                  {isCurrent ? (
                    <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[var(--synera-accent)] text-[var(--primary-foreground)]">
                      <Check className="size-2.5" />
                    </span>
                  ) : null}

                  {restoring === item.id ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="size-4 animate-spin" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
