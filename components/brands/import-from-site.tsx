"use client";

import { useState } from "react";
import { Globe, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { notifyError, readErrorPayload } from "@/lib/notify";
import { formatCostUsd } from "@/lib/ai/pricing";
import type { BrandFormValues } from "@/lib/schemas/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/*
  A DRAFT, and the copy says so everywhere.

  Everything on this panel is inferred: the palette is the colours the site's
  CSS declares most often, which is a good proxy and not the same thing as the
  brand's palette — a site built on a template ranks the template's colours.
  The voice fields are a model's reading of the page.

  So the panel fills the form and stops. It never saves, the fields stay
  editable, and the confidence the model reported is shown next to its own
  output. A draft presented as a finished kit is worse than no draft, because
  nobody edits what looks done.
*/

type SiteImportResponse = {
  url: string;
  suggestedName: string | null;
  palette: Array<{ key: string; value: string }>;
  colors: Array<{ hex: string; count: number }>;
  fonts: string[];
  analysis: {
    tagline: string;
    tone_of_voice: string;
    target_audience: string;
    example_captions: string[];
    art_direction: {
      photographic_style: string;
      lighting: string;
      palette_notes: string;
      avoid: string[];
    };
    confidence: "alta" | "media" | "baja";
    notes: string;
  };
  costUsd: number | null;
};

const CONFIDENCE_COPY: Record<string, string> = {
  alta: "El sitio tenía bastante material.",
  media: "El sitio tenía material parcial. Revisá tono y audiencia.",
  baja: "El sitio tenía muy poco texto. Tomá esto como un punto de partida y poco más.",
};

export function ImportFromSite({
  onDraft,
}: {
  onDraft: (draft: Partial<BrandFormValues>, meta: { fonts: string[] }) => void;
}) {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SiteImportResponse | null>(null);

  async function handleImport() {
    if (url.trim().length < 3) {
      toast.error("Pegá la dirección del sitio.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/analyze/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        notifyError(null, { payload: await readErrorPayload(res), retry: handleImport });
        return;
      }

      const payload = (await res.json()) as SiteImportResponse;
      setResult(payload);

      onDraft(
        {
          // Only fields with something in them: an empty string from the model
          // would wipe a value the user had already typed.
          ...(payload.suggestedName ? { name: payload.suggestedName } : {}),
          ...(payload.analysis.tagline ? { tagline: payload.analysis.tagline } : {}),
          ...(payload.palette.length >= 2 ? { palette: payload.palette } : {}),
          ...(payload.analysis.tone_of_voice
            ? { tone_of_voice: payload.analysis.tone_of_voice }
            : {}),
          ...(payload.analysis.target_audience
            ? { target_audience: payload.analysis.target_audience }
            : {}),
          ...(payload.analysis.example_captions.length > 0
            ? { example_captions: payload.analysis.example_captions }
            : {}),
          art_direction: payload.analysis.art_direction,
        },
        { fonts: payload.fonts },
      );

      toast.success("Borrador cargado. Revisalo antes de guardar.");
    } catch (cause) {
      notifyError(cause, { retry: handleImport });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
      <div className="flex items-center gap-2">
        <Globe className="size-4 text-[var(--synera-accent)]" />
        <h2 className="eyebrow">Importar desde el sitio del cliente</h2>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="import-url" className="text-xs">
            Dirección del sitio
          </Label>
          <Input
            id="import-url"
            value={url}
            placeholder="olivaresdelsur.com.ar"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              // Enter inside a form submits it, and this input sits inside the
              // brand form. Importing is not saving.
              if (event.key === "Enter") {
                event.preventDefault();
                if (!pending) void handleImport();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleImport}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Globe className="size-4" />
          )}
          {pending ? "Leyendo el sitio…" : "Leer el sitio"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Completa el formulario de abajo con un borrador: paleta sacada del CSS,
        y tono, audiencia y dirección de arte leídos por Claude. No guarda nada —
        revisá todo antes.
      </p>

      {result ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs ${
                result.analysis.confidence === "baja"
                  ? "border-destructive/30 text-destructive"
                  : "border-border text-muted-foreground"
              }`}
            >
              Confianza {result.analysis.confidence}
            </span>
            {result.fonts.length > 0 ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                Tipografías del sitio: {result.fonts.join(", ")}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatCostUsd(result.costUsd)}
            </span>
          </div>

          {/*
            The fonts are REPORTED, never applied. The typography picker only
            accepts families it can actually fetch and self-host, and a site's
            font is routinely a licensed foundry face that is not one of them.
            Naming it lets someone pick the closest match on purpose.
          */}
          {result.fonts.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Las tipografías no se aplican solas: elegilas abajo entre las que
              se pueden incrustar en el PNG.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            {result.colors.map((color) => (
              <span
                key={color.hex}
                title={`${color.hex} · ${color.count} usos en el CSS`}
                className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-border"
                  style={{ background: color.hex }}
                />
                {color.hex}
              </span>
            ))}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {CONFIDENCE_COPY[result.analysis.confidence]}{" "}
            {result.analysis.notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}
