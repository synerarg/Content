"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OffscreenSlide, SlidePreview } from "@/components/render/slide-canvas";
import {
  GeneratePanel,
  type GenerationResponse,
} from "@/components/editor/generate-panel";
import { BackgroundPanel } from "@/components/editor/background-panel";
import {
  useRenderAssets,
  type EditorBrand,
} from "@/lib/render/use-render-assets";
import {
  downloadBlob,
  rasterizeSlide,
  readPngDimensions,
} from "@/lib/export/rasterize";
import { TEMPLATES, emptySlots, getTemplate } from "@/templates/registry";
import { FORMATS, FORMAT_KEYS, type FormatKey } from "@/templates/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PREVIEW_WIDTH = 380;

/** Slots whose copy runs long enough to want a textarea. */
const LONG_SLOTS = new Set(["quote", "subline", "body"]);

export function SlideEditor({ brands }: { brands: EditorBrand[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [templateSlug, setTemplateSlug] = useState(TEMPLATES[0].slug);
  const [format, setFormat] = useState<FormatKey>("feed");
  const [slotValues, setSlotValues] = useState<Record<string, string>>(() =>
    emptySlots(TEMPLATES[0]),
  );
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [brief, setBrief] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);

  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const template = getTemplate(templateSlug) ?? TEMPLATES[0];
  const { brandTokens, fontCss, ready, error } = useRenderAssets(brand);

  const slots = useMemo(
    () => ({ ...emptySlots(template), ...slotValues }),
    [template, slotValues],
  );

  function handleTemplateChange(slug: string) {
    const next = getTemplate(slug);
    if (!next) return;
    setTemplateSlug(slug);
    // Carry over any slot the new template also declares, so switching
    // templates does not silently discard copy the user already wrote.
    setSlotValues((current) => {
      const carried: Record<string, string> = {};
      for (const key of Object.keys(emptySlots(next))) {
        carried[key] = current[key] ?? "";
      }
      return carried;
    });
  }

  function handleGenerated(result: GenerationResponse) {
    // Applied together, not through handleTemplateChange: the model produced
    // these slots FOR this template, so the carry-over logic would be wrong.
    setTemplateSlug(result.templateSlug);
    setFormat(result.format);
    setSlotValues(result.slots);
    setCaption(result.caption);
    setHashtags(result.hashtags.join(" "));
  }

  async function copyCaption() {
    const tags = hashtags
      .split(/\s+/)
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .join(" ");
    const text = [caption, tags].filter(Boolean).join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Caption copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  }

  async function handleExport() {
    const node = exportRef.current;
    if (!node || !brand) return;

    if (!ready) {
      toast.error("Las tipografías todavía se están cargando.");
      return;
    }

    setExporting(true);
    try {
      const spec = FORMATS[format];
      const blob = await rasterizeSlide({
        node,
        width: spec.width,
        height: spec.height,
        fontCss,
        fonts: brand.fonts,
      });

      // Verify the file actually came out at the target size before handing it
      // over. A silently resampled export is the exact failure this phase is
      // meant to rule out.
      const dimensions = await readPngDimensions(blob);
      if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
        toast.error(
          `El PNG salió en ${dimensions.width}x${dimensions.height} en lugar de ${spec.width}x${spec.height}.`,
        );
        return;
      }

      const name = `${brand.name}-${template.slug}-${format}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      downloadBlob(blob, `${name}.png`);
      toast.success(`PNG exportado en ${dimensions.width}x${dimensions.height}.`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falló la exportación.",
      );
    } finally {
      setExporting(false);
    }
  }

  const availableFormats = FORMAT_KEYS.filter((key) =>
    template.formats.includes(key),
  );

  return (
    <div className="grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-6">
        {brand ? (
          <>
            <GeneratePanel
              brandId={brand.id}
              brief={brief}
              onBriefChange={setBrief}
              onGenerated={handleGenerated}
            />
            <BackgroundPanel
              brandId={brand.id}
              format={format}
              templateSlug={templateSlug}
              suggestedScene={brief}
              backgroundUrl={backgroundUrl}
              onBackgroundChange={setBackgroundUrl}
            />
          </>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Marca</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {brands.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plantilla</Label>
            <Select value={templateSlug} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Formato</Label>
            <Select
              value={format}
              onValueChange={(next) => setFormat(next as FormatKey)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFormats.map((key) => (
                  <SelectItem key={key} value={key}>
                    {FORMATS[key].label} · {FORMATS[key].width}×
                    {FORMATS[key].height}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{template.description}</p>

        <div className="space-y-4">
          {Object.keys(emptySlots(template)).map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`slot-${key}`} className="capitalize">
                {key}
              </Label>
              {LONG_SLOTS.has(key) ? (
                <Textarea
                  id={`slot-${key}`}
                  rows={3}
                  value={slots[key] ?? ""}
                  onChange={(event) =>
                    setSlotValues((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={`slot-${key}`}
                  value={slots[key] ?? ""}
                  onChange={(event) =>
                    setSlotValues((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              )}
              <p className="text-xs text-muted-foreground">
                {template.slotHints[key]}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="caption">Caption</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyCaption}
              disabled={!caption && !hashtags}
            >
              <Copy className="size-4" />
              Copiar
            </Button>
          </div>
          <Textarea
            id="caption"
            rows={6}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="El texto del posteo. Se genera con el tono de la marca y podés editarlo."
          />

          <div className="space-y-2">
            <Label htmlFor="hashtags">Hashtags</Label>
            <Input
              id="hashtags"
              value={hashtags}
              onChange={(event) => setHashtags(event.target.value)}
              placeholder="crm pymes automatizacion"
            />
            <p className="text-xs text-muted-foreground">
              Separados por espacios, sin #. Se agrega al copiar.
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {/*
        Preview first on a phone, second on desktop.

        Single-column at mobile widths, the DOM order would bury the preview
        under every control — you would be typing copy with no sight of what it
        renders as. `lg:order-none` hands the grid back its natural placement so
        the desktop two-column layout is unchanged.
      */}
      <div className="order-first space-y-4 lg:order-none lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Preview · {FORMATS[format].width}×{FORMATS[format].height}
          </span>
          {!ready ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Cargando tipografías
            </span>
          ) : null}
        </div>

        {brandTokens ? (
          <>
            <div className="rounded-xl border border-border p-3">
              <SlidePreview
                maxWidth={PREVIEW_WIDTH}
                template={template}
                slots={slots}
                format={format}
                brand={brandTokens}
                backgroundUrl={backgroundUrl}
                fontCss={fontCss}
              />
            </div>

            {/* Same component, same props, rendered at full size for export. */}
            <OffscreenSlide
              ref={exportRef}
              template={template}
              slots={slots}
              format={format}
              brand={brandTokens}
              backgroundUrl={backgroundUrl}
              fontCss={fontCss}
            />

            <Button
              onClick={handleExport}
              disabled={exporting || !ready}
              className="w-full"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {exporting ? "Exportando…" : "Exportar PNG"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
