import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const boldHeadlineSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(90),
  subline: z.string().trim().max(160),
  cta: z.string().trim().max(40),
});

export type BoldHeadlineSlots = z.infer<typeof boldHeadlineSlots>;

export function BoldHeadline({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<BoldHeadlineSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const onPrimary = token(brand, "on-primary", bg);

  // Story has 570px more height at the same width, so it gets larger type and
  // deeper padding rather than the same block floated in extra whitespace.
  const pad = isStory ? 96 : 80;
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 104 : 88,
    min: isStory ? 58 : 52,
    from: 30,
    to: 90,
  });
  const sublineSize = fitTextSize(slots.subline, {
    max: isStory ? 40 : 34,
    min: isStory ? 30 : 26,
    from: 60,
    to: 160,
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

      {/*
        Scrim: guarantees headline contrast regardless of what the image does.
        Without this, a light background silently produces unreadable text —
        exactly the failure this product exists to prevent.

        Never fully transparent, unlike the original two-stop version. A
        headline near its 90-character ceiling plus a subline near its 160
        can still wrap to several lines even at fitTextSize's shrunk end, and
        the text block grows UPWARD from the bottom (space-between) — a floor
        of zero opacity at 35% down meant a tall block's top lines could land
        on bare photo. The strong-contrast band also starts sooner (60%
        instead of 72%), for the same reason.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${bg}40 0%, ${bg}1F 30%, ${bg}E6 60%, ${bg} 100%)`,
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
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 64 : 56, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* A short accent rule: cyan as line, never as fill. */}
          <div
            style={{
              width: 88,
              height: 6,
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
                lineHeight: 1.35,
                letterSpacing: fitLetterSpacing(sublineSize),
                fontWeight: brand.bodyWeight,
                opacity: 0.82,
                maxWidth: "88%",
              }}
            >
              {slots.subline}
            </p>
          ) : null}

          {slots.cta ? (
            <div
              style={{
                alignSelf: "flex-start",
                marginTop: 12,
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
