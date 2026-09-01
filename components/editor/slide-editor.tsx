"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, Eye, Loader2, Package, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { OffscreenSlide, SlidePreview } from "@/components/render/slide-canvas";
import {
  GeneratePanel,
  type GenerationResponse,
} from "@/components/editor/generate-panel";
import { BackgroundPanel } from "@/components/editor/background-panel";
import {
  VariantsDialog,
  type CaptionVariant,
  type VariantsRequest,
} from "@/components/editor/variants-dialog";
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
} from "@/lib/export/rasterize";
import {
  TEMPLATES,
  emptySlots,
  getTemplate,
  isSlotRequired,
  slotLabel,
} from "@/templates/registry";
import { FORMATS, FORMAT_KEYS, type FormatKey } from "@/templates/types";
import { TemplatePicker } from "@/components/editor/template-picker";
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
  const [productId, setProductId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [legibility, setLegibility] = useState<LegibilityReport | null>(null);
  // One dialog for the screen; only the request it carries changes.
  const [variantsFor, setVariantsFor] = useState<{
    request: VariantsRequest;
    onApplySlots?: (slots: Record<string, string>) => void;
    onApplyCaption?: (variant: CaptionVariant) => void;
  } | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const template = getTemplate(templateSlug) ?? TEMPLATES[0];
  const { brandTokens, fontCss, ready, error } = useRenderAssets(brand);

  // Memoised because it feeds an effect's dependency list: `brand?.products ?? []`
  // is a fresh array on every render whenever `brand` is undefined, which would
  // re-run the auto-select effect and the blob-URL conversion forever.
  const products = useMemo(() => brand?.products ?? [], [brand]);
  const { byId: productAssets } = useProductAssets(products);

  const needsProduct = template.usesProduct === true;
  const product = productId ? (productAssets[productId] ?? null) : null;
  const selected = products.find((item) => item.id === productId) ?? null;

  /*
    Pick the first product automatically when a product template is chosen.

    Most brands here have one or two products, and landing on a template whose
    whole subject is the product with an empty dashed box in the middle reads as
    broken rather than as a choice to make. Only fills a NULL selection, so it
    never overrides a deliberate pick, and clears itself when the brand changes
    so one client's product cannot appear on another's piece.
  */
  useEffect(() => {
    if (!needsProduct) return;
    if (productId && products.some((item) => item.id === productId)) return;
    setProductId(products[0]?.id ?? null);
  }, [needsProduct, productId, products]);

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

  /*
    Measured on the offscreen node, which is the one rendered at full size —
    the visible preview is CSS-scaled, so its computed font sizes are the
    on-screen ones and every WCAG threshold would be judged against the wrong
    number.
  */
  async function handleCheckLegibility() {
    const node = exportRef.current;
    if (!node || !brand) return;

    setChecking(true);
    try {
      const spec = FORMATS[format];
      setLegibility(
        await checkSlideLegibility({
          node,
          width: spec.width,
          height: spec.height,
          fontCss,
          fonts: brand.fonts,
        }),
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo revisar la legibilidad.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleExport() {
    const node = exportRef.current;
    if (!node || !brand) return;

    if (!ready) {
      toast.error("Las tipografías todavía se están cargando.");
      return;
    }

    // The same gate the batch ZIP applies: a product template with no product
    // rasterizes perfectly happily, into a PNG with a dashed box where the
    // product should be. That is the kind of file that reaches a client.
    if (needsProduct && !product) {
      toast.error("Elegí un producto antes de exportar esta plantilla.");
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
              productId={needsProduct ? productId : null}
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

        {/*
          The picker needs the brand's real tokens to be worth anything, so it
          only renders once they have resolved. Until then the description alone
          keeps the layout from jumping.
        */}
        {brandTokens ? (
          <div className="space-y-2">
            <Label>Plantilla</Label>
            <TemplatePicker
              value={templateSlug}
              format={format}
              brand={brandTokens}
              fontCss={fontCss}
              onChange={handleTemplateChange}
            />
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">{template.description}</p>

        {needsProduct ? (
          <div className="space-y-2">
            <Label>Producto</Label>

            {products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                Esta marca todavía no tiene productos cargados.{" "}
                {brand ? (
                  <Link
                    href={`/marcas/${brand.id}/productos`}
                    className="text-[var(--synera-accent)] underline underline-offset-4"
                  >
                    Cargá uno
                  </Link>
                ) : null}{" "}
                para usar esta plantilla.
              </div>
            ) : (
              <>
                <Select
                  value={productId ?? ""}
                  onValueChange={(next) => setProductId(next)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.hasTransparency ? "" : " · sin recortar"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/*
                  Said here rather than discovered in the preview. The piece is
                  still perfectly usable — the template frames an opaque photo
                  on purpose — but the difference between the two looks is large
                  and it is worth one line to explain which one you are getting.
                */}
                {template.requiresCutout && selected && !selected.hasTransparency ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Package className="mt-0.5 size-3.5 shrink-0" />
                    Esta foto no tiene el fondo recortado, así que se muestra
                    enmarcada en vez de apoyada sobre la escena. Para que flote,
                    recortala desde{" "}
                    {brand ? (
                      <Link
                        href={`/marcas/${brand.id}/productos`}
                        className="underline underline-offset-4"
                      >
                        Productos
                      </Link>
                    ) : (
                      "Productos"
                    )}
                    .
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Textos de la placa
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!brand}
            onClick={() => {
              if (!brand) return;
              setVariantsFor({
                request: {
                  target: "slots",
                  brandId: brand.id,
                  templateSlug: template.slug,
                  format,
                  current: slots,
                  // The brief doubles as the scene here: it is what the
                  // background panel generates from.
                  sceneBrief: brief || undefined,
                },
                onApplySlots: (next) => {
                  setSlotValues(next);
                  toast.success("Texto reemplazado.");
                },
              });
            }}
          >
            <Shuffle className="size-4" />
            Variantes
          </Button>
        </div>

        <div className="space-y-4">
          {Object.keys(emptySlots(template)).map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`slot-${key}`}>
                {slotLabel(template, key)}
                {isSlotRequired(template, key) ? null : (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    opcional
                  </span>
                )}
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
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!brand}
                onClick={() => {
                  if (!brand) return;
                  setVariantsFor({
                    request: {
                      target: "caption",
                      brandId: brand.id,
                      // The single-piece editor has no post type; a standalone
                      // slide is a feed post unless its format says otherwise.
                      postType: format === "story" ? "story" : "feed",
                      current: {
                        caption,
                        hashtags: hashtags.split(/\s+/).filter(Boolean),
                        cta: slots.cta ?? "",
                      },
                      slideText: Object.values(slots)
                        .filter((value) => value.trim())
                        .join(" · "),
                    },
                    onApplyCaption: (variant) => {
                      setCaption(variant.caption);
                      setHashtags(variant.hashtags.join(" "));
                      toast.success("Caption reemplazado.");
                    },
                  });
                }}
              >
                <Shuffle className="size-4" />
                Variantes
              </Button>
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
            {/* The matte. Neutral rather than frosted for the same reason the
                placa's own field is — the padding here is what the client's
                colours are read against, so it cannot carry a blue tint. */}
            <div className="placa-lightbox rounded-2xl p-3">
              <SlidePreview
                maxWidth={PREVIEW_WIDTH}
                template={template}
                slots={slots}
                format={format}
                brand={brandTokens}
                backgroundUrl={backgroundUrl}
                product={product}
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
              product={product}
              fontCss={fontCss}
            />

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckLegibility}
                disabled={checking || !ready}
              >
                {checking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                {checking ? "Midiendo…" : "Revisar legibilidad"}
              </Button>
              <LegibilityChip report={legibility} />
            </div>

            <LegibilityDetails report={legibility} />

            <Button
              onClick={handleExport}
              disabled={exporting || !ready || (needsProduct && !product)}
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
