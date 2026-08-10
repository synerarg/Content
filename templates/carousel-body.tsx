import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const carouselBodySlots = z.object({
  step: z.string().trim().max(4),
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(70),
  body: z.string().trim().max(220),
});

export type CarouselBodySlots = z.infer<typeof carouselBodySlots>;

export function CarouselBody({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<CarouselBodySlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 96 : 80;
  const stepSize = isStory ? 120 : 104;
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 66 : 58,
    min: isStory ? 42 : 38,
    from: 24,
    to: 70,
  });
  const bodySize = fitTextSize(slots.body, {
    max: isStory ? 36 : 32,
    min: isStory ? 27 : 24,
    from: 60,
    to: 220,
  });

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
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
          {/* Body slides are read, not skimmed: the image sits well back. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, ${bg}EB 0%, ${bg}F7 100%)`,
            }}
          />
        </>
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: isStory ? 36 : 30,
          padding: pad,
        }}
      >
        {slots.step ? (
          <span
            style={{
              fontFamily: `'${brand.displayFamily}', sans-serif`,
              fontWeight: brand.displayWeight,
              fontSize: stepSize,
              lineHeight: 0.9,
              color: primary,
              letterSpacing: fitLetterSpacing(stepSize),
            }}
          >
            {slots.step}
          </span>
        ) : null}

        <h2
          style={{
            margin: 0,
            fontFamily: `'${brand.displayFamily}', sans-serif`,
            fontWeight: brand.displayWeight,
            fontSize: headlineSize,
            lineHeight: fitLineHeight(headlineSize),
            letterSpacing: fitLetterSpacing(headlineSize),
            textWrap: "balance",
          }}
        >
          {slots.headline}
        </h2>

        {slots.body ? (
          <p
            style={{
              margin: 0,
              fontSize: bodySize,
              lineHeight: 1.4,
              letterSpacing: fitLetterSpacing(bodySize),
              opacity: 0.84,
              fontWeight: brand.bodyWeight,
              maxWidth: "94%",
            }}
          >
            {slots.body}
          </p>
        ) : null}
      </div>

      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt=""
          style={{
            position: "absolute",
            right: pad,
            bottom: pad,
            height: isStory ? 48 : 40,
            objectFit: "contain",
            opacity: 0.75,
          }}
        />
      ) : null}
    </div>
  );
}
