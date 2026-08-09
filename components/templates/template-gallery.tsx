"use client";

import Link from "next/link";
import { SlidePreview } from "@/components/render/slide-canvas";
import {
  useRenderAssets,
  type EditorBrand,
} from "@/lib/render/use-render-assets";
import { useProductAssets } from "@/lib/render/use-product-assets";
import { TEMPLATES, TEMPLATE_SAMPLES, emptySlots } from "@/templates/registry";
import { FORMATS, type BrandTokens } from "@/templates/types";
import { Button } from "@/components/ui/button";

/** Used when no brand exists yet, so the gallery still shows real layouts. */
const NEUTRAL_TOKENS: BrandTokens = {
  palette: {
    bg: "#0b0d10",
    fg: "#f5f7fa",
    primary: "#84e9ff",
    "on-primary": "#0b0d10",
  },
  displayFamily: "Poppins",
  displayWeight: 700,
  bodyFamily: "Poppins",
  bodyWeight: 400,
  logoUrl: null,
};

export function TemplateGallery({ brand }: { brand: EditorBrand | null }) {
  const { brandTokens, fontCss } = useRenderAssets(brand);
  const tokens = brandTokens ?? NEUTRAL_TOKENS;

  // The gallery's whole job is showing what a template looks like filled in, so
  // a product template previewed with an empty staging box would misrepresent
  // it. Any product does — this is a sample, not a piece.
  const { byId: productAssets } = useProductAssets(brand?.products ?? []);
  const sampleProduct = Object.values(productAssets)[0] ?? null;

  return (
    <div className="grid gap-8 px-6 py-8 sm:grid-cols-2 lg:grid-cols-3 md:px-8">
      {TEMPLATES.map((template, index) => (
        <div
          key={template.slug}
          className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-(--ease-out) space-y-3"
          // Capped rather than index * delay unbounded: fourteen cards should
          // still finish revealing quickly, not queue up half a second of
          // pure waiting for the last row.
          style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
        >
          <div className="rounded-xl border border-border p-3">
            <SlidePreview
              maxWidth={300}
              template={template}
              slots={{
                ...emptySlots(template),
                ...(TEMPLATE_SAMPLES[template.slug] ?? {}),
              }}
              format="feed"
              brand={tokens}
              backgroundUrl={null}
              product={template.usesProduct ? sampleProduct : null}
              fontCss={fontCss}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{template.name}</h3>
              <span className="font-mono text-[10px] text-muted-foreground">
                {template.slug}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {template.description}
            </p>
            <p className="text-xs text-muted-foreground">
              Formatos:{" "}
              {template.formats.map((key) => FORMATS[key].label).join(" · ")}
            </p>
          </div>

          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/editor">Usar en el editor</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
