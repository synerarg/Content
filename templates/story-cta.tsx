import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const storyCtaSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(70),
  subline: z.string().trim().max(120),
  cta: z.string().trim().max(30),
});

export type StoryCtaSlots = z.infer<typeof storyCtaSlots>;

export function StoryCta({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<StoryCtaSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const onPrimary = token(brand, "on-primary", bg);

  const pad = isStory ? 96 : 80;
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 82 : 70,
    min: isStory ? 50 : 44,
    from: 22,
    to: 70,
  });
  const sublineSize = fitTextSize(slots.subline, {
    max: isStory ? 36 : 32,
    min: isStory ? 28 : 25,
    from: 40,
    to: 120,
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
          background: `linear-gradient(180deg, ${bg}55 0%, ${bg}B3 45%, ${bg}F2 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          /*
            Content sits low on purpose. On a story the bottom fifth is where the
            thumb rests and where Instagram puts its own chrome, so the CTA lands
            above that band rather than under it.
          */
          justifyContent: "flex-end",
          gap: 28,
          padding: pad,
          paddingBottom: isStory ? 220 : pad,
        }}
      >
        <div
          style={{
            width: 72,
            height: 5,
            borderRadius: 999,
            background: primary,
          }}
        />

        <h1
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
        </h1>

        {slots.subline ? (
          <p
            style={{
              margin: 0,
              fontSize: sublineSize,
              lineHeight: 1.34,
              letterSpacing: fitLetterSpacing(sublineSize),
              opacity: 0.84,
              fontWeight: brand.bodyWeight,
              maxWidth: "88%",
            }}
          >
            {slots.subline}
          </p>
        ) : null}

        {slots.cta ? (
          <div
            style={{
              alignSelf: "stretch",
              marginTop: 12,
              background: primary,
              color: onPrimary,
              fontWeight: 700,
              fontSize: isStory ? 36 : 32,
              padding: isStory ? "28px 40px" : "22px 36px",
              borderRadius: 20,
              textAlign: "center",
            }}
          >
            {slots.cta}
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
            height: isStory ? 56 : 48,
            objectFit: "contain",
          }}
        />
      ) : null}
    </div>
  );
}
