import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const featureStackSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(70),
  item_1: z.string().trim().min(1, "El primer beneficio es obligatorio.").max(90),
  item_2: z.string().trim().max(90),
  item_3: z.string().trim().max(90),
  cta: z.string().trim().max(30),
  footnote: z.string().trim().max(120),
});

export type FeatureStackSlots = z.infer<typeof featureStackSlots>;

/**
 * A tick, drawn rather than typed.
 *
 * `✓` would be a character, and the brand's typeface is a self-hosted .woff2
 * whose subset may not carry U+2713 — which in the exported PNG means either a
 * silent fallback to a system face for that one glyph, or tofu. Two borders and
 * a rotation are geometry, so they render from the brand's palette alone and
 * cannot go missing. Worst case the rotation is dropped and it degrades to a
 * small corner inside a dot, which is legible.
 */
function Tick({ color, size }: { color: string; size: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${color}2E`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          width: Math.round(size * 0.24),
          height: Math.round(size * 0.44),
          borderRight: `${Math.max(3, Math.round(size * 0.09))}px solid ${color}`,
          borderBottom: `${Math.max(3, Math.round(size * 0.09))}px solid ${color}`,
          transform: "rotate(45deg)",
          marginTop: -Math.round(size * 0.08),
        }}
      />
    </span>
  );
}

/*
  Benefits as cards floating over the image, not as a list beside it.

  Copied from how a card issuer advertises perks: the photograph carries the
  desire, and the reasons sit on top of it in translucent panels that let the
  image show through. That translucency is the whole difference from
  `list-tips`, where the text sits on a calm area of the frame and the image
  stays behind. Here the panels ARE the composition — which is why the
  background prompt asks for the subject high and the lower two thirds quiet.

  `footnote` is not decoration. Every real post of this shape carries the
  condition the benefits depend on, and an agency shipping perks without it is
  writing a cheque the client signs.
*/
export function FeatureStack({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<FeatureStackSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 88 : 72;

  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 82 : 70,
    min: isStory ? 50 : 44,
    from: 22,
    to: 70,
  });

  const items = [slots.item_1, slots.item_2, slots.item_3].filter(
    (item) => item.trim().length > 0,
  );

  const itemSize = isStory ? 32 : 28;
  const tickSize = isStory ? 46 : 40;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: bg,
        color: fg,
        fontFamily: `'${brand.bodyFamily}', sans-serif`,
      }}
    >
      {backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* Light at the top so the headline reads, dark at the bottom so the
          panels have something to sit against. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${bg}E6 0%, ${bg}73 26%, ${bg}A6 58%, ${bg}F2 88%, ${bg} 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: pad,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 34 : 26 }}>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt=""
                style={{ height: isStory ? 60 : 52, objectFit: "contain" }}
              />
            ) : null}
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: `'${brand.displayFamily}', sans-serif`,
              fontWeight: brand.displayWeight,
              fontSize: headlineSize,
              lineHeight: fitLineHeight(headlineSize),
              letterSpacing: fitLetterSpacing(headlineSize),
              textWrap: "balance",
              maxWidth: "94%",
            }}
          >
            {slots.headline}
          </h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 18 : 14 }}>
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: isStory ? 22 : 18,
                padding: isStory ? "26px 30px" : "22px 26px",
                borderRadius: isStory ? 26 : 22,
                background: `${fg}14`,
                border: `1px solid ${fg}24`,
              }}
            >
              <Tick color={primary} size={tickSize} />
              <span
                style={{
                  fontSize: itemSize,
                  lineHeight: 1.35,
                  fontWeight: brand.bodyWeight,
                }}
              >
                {item}
              </span>
            </div>
          ))}

          {slots.cta ? (
            <div
              style={{
                marginTop: isStory ? 14 : 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                padding: isStory ? "28px 34px" : "24px 30px",
                borderRadius: isStory ? 26 : 22,
                background: primary,
                color: token(brand, "on-primary", bg),
                fontWeight: 600,
                fontSize: isStory ? 34 : 30,
              }}
            >
              <span>{slots.cta}</span>
              {/* Chevron by the same geometry as the tick, for the same reason. */}
              <span
                style={{
                  flexShrink: 0,
                  width: isStory ? 18 : 16,
                  height: isStory ? 18 : 16,
                  borderTop: `4px solid ${token(brand, "on-primary", bg)}`,
                  borderRight: `4px solid ${token(brand, "on-primary", bg)}`,
                  transform: "rotate(45deg)",
                }}
              />
            </div>
          ) : null}

          <p
            style={{
              margin: 0,
              marginTop: isStory ? 10 : 6,
              fontSize: isStory ? 22 : 20,
              lineHeight: 1.35,
              opacity: 0.45,
              minHeight: isStory ? 30 : 27,
            }}
          >
            {slots.footnote}
          </p>
        </div>
      </div>
    </div>
  );
}
