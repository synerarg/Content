import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import type { TemplateProps } from "./types";

export const carouselCoverSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(80),
  subline: z.string().trim().max(120),
  swipe_hint: z.string().trim().max(24),
});

export type CarouselCoverSlots = z.infer<typeof carouselCoverSlots>;

export function CarouselCover({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<CarouselCoverSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const onPrimary = token(brand, "on-primary", bg);

  const pad = isStory ? 96 : 80;
  const headlineSize = isStory ? 100 : 86;

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

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${bg}66 0%, ${bg}CC 55%, ${bg} 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 30,
          padding: pad,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: `'${brand.displayFamily}', sans-serif`,
            fontWeight: brand.displayWeight,
            fontSize: headlineSize,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            textWrap: "balance",
          }}
        >
          {slots.headline}
        </h1>

        {slots.subline ? (
          <p
            style={{
              margin: 0,
              fontSize: isStory ? 38 : 33,
              lineHeight: 1.34,
              opacity: 0.82,
              fontWeight: brand.bodyWeight,
              maxWidth: "86%",
            }}
          >
            {slots.subline}
          </p>
        ) : null}

        {/* The swipe affordance is what separates a cover from a single post. */}
        {slots.swipe_hint ? (
          <div
            style={{
              alignSelf: "flex-start",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: primary,
              color: onPrimary,
              fontWeight: 600,
              fontSize: isStory ? 30 : 27,
              padding: isStory ? "18px 34px" : "15px 30px",
              borderRadius: 999,
            }}
          >
            {slots.swipe_hint}
            <span style={{ fontSize: isStory ? 32 : 29, lineHeight: 1 }}>→</span>
          </div>
        ) : null}
      </div>

      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt=""
          style={{
            position: "absolute",
            left: pad,
            top: pad,
            height: isStory ? 60 : 52,
            objectFit: "contain",
          }}
        />
      ) : null}
    </div>
  );
}
