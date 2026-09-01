"use client";

import { SlidePreview } from "@/components/render/slide-canvas";
import { TEMPLATES, TEMPLATE_SAMPLES, emptySlots } from "@/templates/registry";
import type { BrandTokens, FormatKey } from "@/templates/types";
import { cn } from "@/lib/utils";

/*
  Visual template selection.

  This replaced a dropdown of names. A name tells you nothing about what a
  template looks like, so choosing one meant picking blind and then checking the
  preview — recall instead of recognition. Every option is now rendered live
  with the CURRENT brand's real palette and typefaces, which is also the only
  honest preview: the same template looks completely different across two
  brands.

  Filtered to templates that support the chosen format, so a story-only layout
  never appears while a feed post is being made.
*/
export function TemplatePicker({
  value,
  format,
  brand,
  fontCss,
  onChange,
}: {
  value: string;
  format: FormatKey;
  brand: BrandTokens;
  fontCss: string;
  onChange: (slug: string) => void;
}) {
  const available = TEMPLATES.filter((template) =>
    template.formats.includes(format),
  );

  return (
    <div
      role="radiogroup"
      aria-label="Plantilla"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {available.map((template) => {
        const selected = template.slug === value;

        return (
          <button
            key={template.slug}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(template.slug)}
            className={cn(
              "group space-y-2 rounded-2xl border p-2 text-left transition-colors",
              selected
                ? "border-[color-mix(in_oklch,var(--synera-accent)_45%,transparent)] bg-accent"
                : "border-border hover:border-[color-mix(in_oklch,var(--synera-accent)_25%,transparent)]",
            )}
          >
            {/*
              Pointer events off: the preview is decoration for the button, and
              a click landing on the inner canvas instead of the button would
              silently do nothing.
            */}
            <div className="pointer-events-none overflow-hidden rounded-xl">
              <SlidePreview
                maxWidth={160}
                template={template}
                slots={{
                  ...emptySlots(template),
                  ...(TEMPLATE_SAMPLES[template.slug] ?? {}),
                }}
                format={format}
                brand={brand}
                backgroundUrl={null}
                fontCss={fontCss}
              />
            </div>

            <p
              className={cn(
                "text-xs leading-tight",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {template.name}
            </p>
          </button>
        );
      })}
    </div>
  );
}
