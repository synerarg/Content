"use client";

import { paletteToCssVars } from "@/lib/render/brand-tokens";
import type { AnyTemplateDefinition } from "@/templates/registry";
import { FORMATS, type BrandTokens, type FormatKey } from "@/templates/types";

export type SlideCanvasProps = {
  ref?: React.Ref<HTMLDivElement>;
  template: AnyTemplateDefinition;
  slots: Record<string, string>;
  format: FormatKey;
  brand: BrandTokens;
  backgroundUrl: string | null;
  /** Self-contained @font-face rules. Also passed to the rasterizer. */
  fontCss: string;
};

/**
 * The slide, at exactly its output dimensions.
 *
 * This is the ONLY component that renders a slide. The editor preview and the
 * export both mount this same element with the same props — the preview merely
 * wraps it in a CSS transform. That is what makes "the PNG matches the preview"
 * structurally true rather than something to keep in sync by hand.
 */
export function SlideCanvas({
  ref,
  template,
  slots,
  format,
  brand,
  backgroundUrl,
  fontCss,
}: SlideCanvasProps) {
  const spec = FORMATS[format];
  const Component = template.component;

  return (
    <div
      ref={ref}
      data-slide-canvas
      style={{
        width: spec.width,
        height: spec.height,
        position: "relative",
        overflow: "hidden",
        // Brand palette as CSS custom properties. Templates read these rather
        // than hardcoding any color.
        ...paletteToCssVars(brand.palette),
      }}
    >
      {fontCss ? (
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      ) : null}
      <Component
        slots={slots}
        format={format}
        brand={brand}
        backgroundUrl={backgroundUrl}
      />
    </div>
  );
}

/** The same canvas, scaled down to fit a container. Preview only. */
export function SlidePreview({
  maxWidth,
  ...props
}: SlideCanvasProps & { maxWidth: number }) {
  const spec = FORMATS[props.format];
  const scale = maxWidth / spec.width;

  return (
    <div
      style={{
        width: maxWidth,
        height: spec.height * scale,
        overflow: "hidden",
        borderRadius: 12,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <SlideCanvas {...props} />
      </div>
    </div>
  );
}

/**
 * Offscreen host for the export node.
 *
 * Positioned far off-canvas rather than `display: none`, because a hidden
 * subtree has no layout and html-to-image would capture an empty box.
 */
export function OffscreenSlide(props: SlideCanvasProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: -100000,
        width: FORMATS[props.format].width,
        height: FORMATS[props.format].height,
        pointerEvents: "none",
        opacity: 1,
      }}
    >
      <SlideCanvas {...props} />
    </div>
  );
}
