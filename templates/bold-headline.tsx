import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
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
  const headlineSize = isStory ? 104 : 88;
  const sublineSize = isStory ? 40 : 34;

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

      {/* Scrim: guarantees headline contrast regardless of what the image does.
          Without this, a light background silently produces unreadable text —
          exactly the failure this product exists to prevent. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${bg}33 0%, ${bg}00 35%, ${bg}D9 72%, ${bg} 100%)`,
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
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
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
