"use client";

import { paletteToCssVars } from "@/lib/render/brand-tokens";
import type { AnyTemplateDefinition } from "@/templates/registry";
import {
  FORMATS,
  type BrandTokens,
  type FormatKey,
  type ProductAsset,
} from "@/templates/types";

export type SlideCanvasProps = {
  ref?: React.Ref<HTMLDivElement>;
  template: AnyTemplateDefinition;
  slots: Record<string, string>;
  format: FormatKey;
  brand: BrandTokens;
  backgroundUrl: string | null;
  /** The client's product, already converted to a blob URL. Null renders a placeholder. */
  product?: ProductAsset | null;
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
  product = null,
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
        product={product}
      />
    </div>
  );
}

/**
 * The same canvas, scaled down to fit a container. Preview only.
 *
 * Three layers, and the two extra ones are not decoration.
 *
 * WHY. This is a colour-critical viewing surface: it shows a CLIENT's palette,
 * and the studio's own canvas is #05060f. A brand whose background is dark —
 * the Taller Peralta fixture is #0b0d10 — renders a placa that dissolves into
 * the chrome, with no edge to say where the deliverable stops and the app
 * begins. Image editors surround a canvas with flat neutral grey for exactly
 * this reason, and `.placa-lightbox` is that field.
 *
 * WHY THREE LAYERS rather than a class on one box. The scaled canvas fills its
 * container edge to edge, so an inset hairline on that container is painted
 * over by the placa itself and never seen. So: the neutral field sits BELOW
 * (it also backs a transparent or still-loading placa), the clipped canvas in
 * the middle, and the hairline rides ABOVE as its own overlay. A plain border
 * would work too, but it grows the box by 2px, and every caller sizes this
 * from `maxWidth` — the preview must be exactly as wide as it says it is.
 */
export function SlidePreview({
  maxWidth,
  ...props
}: SlideCanvasProps & { maxWidth: number }) {
  const spec = FORMATS[props.format];
  const scale = maxWidth / spec.width;
  const height = spec.height * scale;
  const radius = 12;

  return (
    <div style={{ position: "relative", width: maxWidth, height }}>
      <div
        aria-hidden
        className="placa-lightbox"
        style={{ position: "absolute", inset: 0, borderRadius: radius }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: radius,
        }}
      >
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <SlideCanvas {...props} />
        </div>
      </div>

      {/* The edge. Above the placa, and never interactive — several callers
          wrap this whole preview in a button or a link. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.09)",
          pointerEvents: "none",
        }}
      />
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
