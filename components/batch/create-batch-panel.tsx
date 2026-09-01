"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError, readErrorPayload } from "@/lib/notify";
import {
  CAROUSEL_SLIDE_RANGE,
  RECIPE_PRESETS,
  RECIPE_LIMITS,
  KIND_LABEL,
  describeRecipe,
  recipeSchema,
  totalPosts,
  totalSlides,
  type BatchRecipe,
  type PostKind,
} from "@/lib/batch/recipe";
import { describeGaps, type BrandReadiness } from "@/lib/brand-readiness";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BrandOption = {
  id: string;
  name: string;
  readiness: BrandReadiness;
  products: Array<{ id: string; name: string }>;
};

const CUSTOM = "custom";
/** Sentinel for the Select: Radix treats "" as "no value" and shows the placeholder. */
const NO_PRODUCT = "none";

/** Publishing order, which is not the enum's declaration order. */
const KIND_ORDER: PostKind[] = ["carousel", "feed", "story"];

const KIND_HINT: Record<PostKind, string> = {
  carousel: "Desarrolla una idea por placa, en orden.",
  feed: "Una placa sola, formato feed.",
  story: "Una placa sola, vertical. Se ve dos segundos.",
};

type CustomState = Record<PostKind, { count: number; slides: number }>;

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        disabled={value <= min}
        aria-label={`Menos ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        disabled={value >= max}
        aria-label={`Más ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

export function CreateBatchPanel({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [presetId, setPresetId] = useState(RECIPE_PRESETS[0]?.id ?? CUSTOM);
  const [custom, setCustom] = useState<CustomState>({
    carousel: { count: 1, slides: 4 },
    feed: { count: 1, slides: 1 },
    story: { count: 1, slides: 1 },
  });
  const [productId, setProductId] = useState<string>(NO_PRODUCT);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const recipe: BatchRecipe = useMemo(() => {
    if (presetId !== CUSTOM) {
      return RECIPE_PRESETS.find((p) => p.id === presetId)?.recipe ?? [];
    }
    return KIND_ORDER.map((type) => ({
      type,
      count: custom[type].count,
      slides: custom[type].slides,
    })).filter((item) => item.count > 0);
  }, [presetId, custom]);

  // Validated against the same schema the route uses, so an invalid
  // composition is caught here with the same message rather than round-tripping.
  const validation = recipeSchema.safeParse(recipe);
  const recipeError = validation.success
    ? null
    : (validation.error.issues[0]?.message ?? "Composición inválida.");

  const posts = totalPosts(recipe);
  const slides = totalSlides(recipe);

  const brand = brands.find((item) => item.id === brandId);
  const readiness = brand?.readiness;
  const brandBlocked = readiness ? !readiness.ready : false;

  const products = brand?.products ?? [];
  // A product chosen for a brand that no longer has it — after switching brands —
  // must not be sent: the route would reject it as belonging to another brand.
  const selectedProductId =
    productId !== NO_PRODUCT && products.some((item) => item.id === productId)
      ? productId
      : null;

  /*
    A product only ever appears on a standalone piece.

    Carousel slides use the cover/body templates, which composite nothing, so a
    recipe of carousels alone with a product selected produces a batch where the
    product is nowhere — and the only clue would be that the pieces look normal.
    Said before the call rather than discovered after it.
  */
  const productHasNowhereToGo =
    selectedProductId !== null &&
    recipe.every((item) => item.type === "carousel" || item.count === 0);

  async function handleGenerate() {
    if (brief.trim().length < 8) {
      toast.error("Contame un poco más sobre el lote.");
      return;
    }
    if (recipeError) {
      toast.error(recipeError);
      return;
    }
    if (brandBlocked) {
      toast.error("Completá la marca antes de generar.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);

    try {
      const res = await fetch("/api/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          brandId,
          brief,
          recipe,
          productId: selectedProductId,
        }),
      });

      if (!res.ok) {
        notifyError(null, {
          payload: await readErrorPayload(res),
          retry: handleGenerate,
        });
        return;
      }

      const payload = await res.json();
      for (const warning of payload.warnings ?? []) {
        toast.warning(warning);
      }
      toast.success(
        `Lote creado: ${payload.posts} piezas, ${payload.slides} placas.`,
      );
      router.push(`/contenido/${payload.batchId}`);
      router.refresh();
    } catch (cause) {
      notifyError(cause, { retry: handleGenerate });
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card glass-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Nuevo lote</h2>
      </div>

      <div className="space-y-2">
        <Label>Marca</Label>
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/*
          Blocks the spend and says exactly what to go and fix, with a link that
          lands on the brand. A generic "algo salió mal" after the call would
          have cost the call.
        */}
        {readiness && !readiness.ready ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            {describeGaps(readiness.gaps)} de {brand?.name}.
            <Link
              href={`/marcas/${brandId}`}
              className="underline underline-offset-4"
            >
              Completar la marca
            </Link>
          </p>
        ) : null}
      </div>

      {/*
        Only shown when the brand has products. A "(ninguno)" dropdown on every
        brand that will never use one is a control that exists to be ignored.
      */}
      {products.length > 0 ? (
        <div className="space-y-2">
          <Label>Producto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRODUCT}>Sin producto</SelectItem>
              {products.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground">
            {selectedProductId
              ? "Las piezas sueltas van a hablar de este producto y a mostrar su foto real. Los fondos se piden como escenas vacías, para que el modelo no dibuje otro producto encima."
              : "Elegí un producto si querés que el lote sea sobre él."}
          </p>

          {productHasNowhereToGo ? (
            <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] px-3 py-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Con sólo carruseles el producto no aparece en ninguna placa: las
              plantillas de carrusel no muestran productos. Agregá un feed o una
              historia.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Composición</Label>
        <div className="flex flex-wrap gap-2">
          {[...RECIPE_PRESETS, { id: CUSTOM, label: "Personalizado", description: "", recipe: [] }].map(
            (preset) => {
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetId(preset.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-[color-mix(in_oklch,var(--synera-accent)_40%,transparent)] bg-accent/50 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              );
            },
          )}
        </div>

        {presetId === CUSTOM ? (
          <div className="divide-y divide-border rounded-lg border border-border">
            {KIND_ORDER.map((type) => (
              <div
                key={type}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-40">
                  <p className="text-sm font-medium">{KIND_LABEL[type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_HINT[type]}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {type === "carousel" && custom.carousel.count > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Placas
                      </span>
                      <Stepper
                        label="placas del carrusel"
                        value={custom.carousel.slides}
                        min={CAROUSEL_SLIDE_RANGE.min}
                        max={CAROUSEL_SLIDE_RANGE.max}
                        onChange={(slides) =>
                          setCustom((c) => ({
                            ...c,
                            carousel: { ...c.carousel, slides },
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  <Stepper
                    label={KIND_LABEL[type]}
                    value={custom[type].count}
                    min={0}
                    max={RECIPE_LIMITS.maxPosts}
                    onChange={(count) =>
                      setCustom((c) => ({ ...c, [type]: { ...c[type], count } }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {RECIPE_PRESETS.find((p) => p.id === presetId)?.description}
          </p>
        )}

        {recipeError ? (
          <p className="text-sm text-destructive">{recipeError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">{describeRecipe(recipe)}</span> —{" "}
            {posts} pieza{posts === 1 ? "" : "s"}, {slides} placa
            {slides === 1 ? "" : "s"}. Los fondos se generan después, desde el
            lote.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="batch-brief">Brief</Label>
        <Textarea
          id="batch-brief"
          rows={3}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="una semana de contenido sobre por qué una pyme necesita ordenar sus clientes"
        />
        <p className="text-xs text-muted-foreground">
          Claude escribe cada pieza con un ángulo distinto del mismo tema, elige
          plantilla y escribe caption y hashtags.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleGenerate}
          disabled={pending || !brandId || Boolean(recipeError) || brandBlocked}
          title={
            brandBlocked
              ? `${describeGaps(readiness?.gaps ?? [])} de esta marca.`
              : undefined
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Escribiendo el lote…" : "Generar lote"}
        </Button>

        {pending ? (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            <X className="size-4" />
            Cancelar
          </Button>
        ) : null}
      </div>

      {pending ? (
        <p className="text-xs text-muted-foreground">
          Claude escribe las {posts} piezas en una sola llamada. Suele tardar
          entre 30 y 70 segundos.
        </p>
      ) : null}
    </div>
  );
}
