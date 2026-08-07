import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import type { TemplateProps } from "./types";
import { fitTextSize } from "@/lib/render/fit-text";

export const bigNumberSlots = z.object({
  eyebrow: z.string().trim().max(40),
  number: z.string().trim().min(1, "El número es obligatorio.").max(10),
  unit: z.string().trim().max(10),
  support: z.string().trim().max(90),
  cta: z.string().trim().max(24),
});

export type BigNumberSlots = z.infer<typeof bigNumberSlots>;

/*
  One figure, at a size nothing else on the feed will match.

  The discipline is subtraction. A discount post fails when the percentage
  competes with a headline, a logo, a photo and three conditions; it works when
  the figure is enormous and everything else is deliberately, almost rudely
  small. So the slots are capped hard — the number at 10 characters, the unit at
  10 — because the format only survives if nothing else grows.

  `unit` is a separate slot rather than part of the number so it can be set on
  its own line at its own size: "20%" over "OFF" is the shape this composition
  is copied from, and one string of "20% OFF" would wrap wherever it liked.

  The background is generated but is asked for almost nothing — see
  COMPOSITION_BY_TEMPLATE. When there is none, the radial glow carries the card
  on its own rather than leaving a flat rectangle.
*/
export function BigNumber({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<BigNumberSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const onPrimary = token(brand, "on-primary", bg);

  const pad = isStory ? 96 : 80;

  /*
    The scale is keyed to character count and falls fast: "3x" can be enormous,
    "$36.000" cannot. `from: 2` means only the very shortest values get the
    maximum, which is the correct bias for this template.
  */
  const numberSize = fitTextSize(slots.number, {
    max: isStory ? 340 : 296,
    min: isStory ? 150 : 132,
    from: 2,
    to: 9,
  });

  /*
    The unit gets its OWN scale, and then the smaller of the two.

    It was 82% of the number size, full stop, which is right for "OFF" and
    catastrophic for "por semana": ten characters at 243px measured 256px wider
    than the card. Both rules are needed — the ratio keeps a short unit tied to
    the figure it belongs to, the scale keeps a long one on the canvas.
  */
  const unitSize = Math.min(
    Math.round(numberSize * 0.82),
    fitTextSize(slots.unit, {
      max: isStory ? 290 : 250,
      min: isStory ? 78 : 68,
      from: 3,
      to: 10,
    }),
  );

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

      {/*
        Heavier than the usual scrim, and it has to be: type at 296px is
        readable only if the surface behind it is essentially featureless. The
        glow is drawn over the photo rather than instead of it, so the card
        holds together with or without an image.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(90% 60% at 50% 46%, ${primary}26 0%, ${bg}CC 46%, ${bg}F2 78%, ${bg} 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          padding: pad,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 60 : 52, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isStory ? 22 : 18,
          }}
        >
          {slots.eyebrow ? (
            <p
              style={{
                margin: 0,
                fontSize: isStory ? 34 : 30,
                fontWeight: brand.bodyWeight,
                opacity: 0.75,
                letterSpacing: "0.01em",
              }}
            >
              {slots.eyebrow}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              fontFamily: `'${brand.displayFamily}', sans-serif`,
              fontWeight: brand.displayWeight,
              letterSpacing: "-0.045em",
              lineHeight: 0.86,
            }}
          >
            <span style={{ fontSize: numberSize, whiteSpace: "nowrap" }}>
              {slots.number}
            </span>
            {slots.unit ? (
              <span style={{ fontSize: unitSize, whiteSpace: "nowrap" }}>
                {slots.unit}
              </span>
            ) : null}
          </div>

          {slots.support ? (
            <p
              style={{
                margin: 0,
                marginTop: isStory ? 14 : 10,
                fontSize: isStory ? 32 : 28,
                lineHeight: 1.35,
                fontWeight: brand.bodyWeight,
                opacity: 0.8,
                maxWidth: "82%",
              }}
            >
              {slots.support}
            </p>
          ) : null}
        </div>

        <div style={{ minHeight: isStory ? 86 : 74, display: "flex", alignItems: "center" }}>
          {slots.cta ? (
            <div
              style={{
                background: primary,
                color: onPrimary,
                fontWeight: 600,
                fontSize: isStory ? 34 : 30,
                padding: isStory ? "22px 44px" : "18px 38px",
                borderRadius: 999,
              }}
            >
              {slots.cta}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
