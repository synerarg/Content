"use client";

import { useRef, useState } from "react";
import { Loader2, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError, readErrorPayload } from "@/lib/notify";
import { formatCostUsd } from "@/lib/ai/pricing";
import { getTemplate, slotLabel } from "@/templates/registry";
import type { FormatKey } from "@/templates/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/*
  "This one is not it — give me three others."

  The gap this fills is not cosmetic. Until now there were exactly two ways to
  change a piece you did not like: retype it, or regenerate the whole batch and
  lose the four pieces that were fine. Nothing in between, on the screen where
  you actually notice.
*/

export type SlotVariant = { angle: string; slots: Record<string, string> };
export type CaptionVariant = {
  angle: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

export const DEFAULT_VARIANT_COUNT = 3;

type SlotsRequest = {
  target: "slots";
  brandId: string;
  templateSlug: string;
  format: FormatKey;
  current: Record<string, string>;
  sceneBrief?: string;
};

type CaptionRequest = {
  target: "caption";
  brandId: string;
  postType: string;
  current: { caption: string; hashtags: string[]; cta: string };
  slideText?: string;
};

export type VariantsRequest = SlotsRequest | CaptionRequest;

function SlotPreview({
  templateSlug,
  slots,
}: {
  templateSlug: string;
  slots: Record<string, string>;
}) {
  const template = getTemplate(templateSlug);
  const entries = Object.entries(slots).filter(([, value]) => value.trim());

  return (
    <dl className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {template ? slotLabel(template, key) : key}
          </dt>
          <dd className="text-sm leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CaptionPreview({ variant }: { variant: CaptionVariant }) {
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm leading-snug">{variant.caption}</p>
      {variant.cta ? (
        <p className="text-xs text-muted-foreground">CTA: {variant.cta}</p>
      ) : null}
      {variant.hashtags.length > 0 ? (
        <p className="text-xs text-[var(--synera-accent)]">
          {variant.hashtags.map((tag) => `#${tag}`).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function VariantsDialog({
  open,
  onOpenChange,
  request,
  count = DEFAULT_VARIANT_COUNT,
  onApplySlots,
  onApplyCaption,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: VariantsRequest;
  count?: number;
  onApplySlots?: (slots: Record<string, string>) => void;
  onApplyCaption?: (variant: CaptionVariant) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Array<SlotVariant | CaptionVariant>>([]);
  const [cost, setCost] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    // Aborting stops the browser waiting and stops the result being applied. It
    // does NOT cancel a generation the provider already started, so a cancelled
    // request may still have cost money — the same honest limit the image
    // panels carry.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch("/api/generate/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...request, count }),
      });

      if (!res.ok) {
        notifyError(null, { payload: await readErrorPayload(res), retry: run });
        return;
      }

      const payload = await res.json();
      setVariants(payload.variants ?? []);
      setCost(payload.costUsd ?? null);
      for (const warning of payload.warnings ?? []) toast.warning(warning);
    } catch (cause) {
      if (controller.signal.aborted) return;
      notifyError(cause, { retry: run });
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      // Options are dropped on close rather than kept. A stale list against
      // copy that has been edited since is worse than an empty panel: applying
      // one would silently revert the edit.
      setVariants([]);
      setCost(null);
    }
    onOpenChange(next);
  }

  function apply(variant: SlotVariant | CaptionVariant) {
    if ("slots" in variant) onApplySlots?.(variant.slots);
    else onApplyCaption?.(variant);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {request.target === "slots" ? "Otras opciones de texto" : "Otros captions"}
          </DialogTitle>
          <DialogDescription>
            Cada opción cambia el argumento, no sólo las palabras. El ángulo de
            la pieza actual queda descartado.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {variants.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {loading
                ? "Escribiendo las opciones…"
                : `Pedí ${count} alternativas y elegí la que sirva.`}
            </p>
          ) : (
            variants.map((variant, index) => (
              <div
                key={`${variant.angle}-${index}`}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--synera-accent)]">
                    {variant.angle || `Opción ${index + 1}`}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => apply(variant)}>
                    Usar esta
                  </Button>
                </div>

                {"slots" in variant ? (
                  <SlotPreview
                    templateSlug={
                      request.target === "slots" ? request.templateSlug : ""
                    }
                    slots={variant.slots}
                  />
                ) : (
                  <CaptionPreview variant={variant} />
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shuffle className="size-4" />
            )}
            {loading
              ? "Generando…"
              : variants.length > 0
                ? "Pedir otras"
                : `Generar ${count} opciones`}
          </Button>

          {loading ? (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              <X className="size-4" />
              Cancelar
            </Button>
          ) : null}

          {cost !== null ? (
            <span className="text-xs text-muted-foreground">
              {formatCostUsd(cost)}
            </span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
