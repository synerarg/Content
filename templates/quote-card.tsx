import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const quoteCardSlots = z.object({
  quote: z.string().trim().min(1, "La cita es obligatoria.").max(220),
  author: z.string().trim().max(60),
  role: z.string().trim().max(80),
});

export type QuoteCardSlots = z.infer<typeof quoteCardSlots>;

export function QuoteCard({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<QuoteCardSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const surface = token(brand, "surface", bg);

  const pad = isStory ? 96 : 80;

  // Quotes get unreadable fast when they run long, so size steps down as the
  // text grows instead of overflowing the canvas. A real interpolation now,
  // not the 3-step lookup this used to be — that curve topped out at "longer
  // than 160 characters" and never shrank further even as a quote grew toward
  // its real 220-character ceiling.
  const quoteSize = fitTextSize(slots.quote, {
    max: isStory ? 82 : 74,
    min: isStory ? 44 : 38,
    from: 50,
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
          {/* Quotes are read, not skimmed, so the image is pushed further back
              than in bold-headline. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, ${bg}E6 0%, ${bg}F2 100%)`,
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
          gap: 44,
          padding: pad,
        }}
      >
        <div
          style={{
            fontFamily: `'${brand.displayFamily}', serif`,
            fontWeight: brand.displayWeight,
            fontSize: isStory ? 200 : 168,
            lineHeight: 0.6,
            height: isStory ? 96 : 82,
            color: primary,
          }}
        >
          &ldquo;
        </div>

        <blockquote
          style={{
            margin: 0,
            fontFamily: `'${brand.displayFamily}', serif`,
            fontWeight: brand.displayWeight,
            fontSize: quoteSize,
            lineHeight: 1.18,
            letterSpacing: fitLetterSpacing(quoteSize),
            textWrap: "balance",
          }}
        >
          {slots.quote}
        </blockquote>

        {slots.author || slots.role ? (
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{ width: 56, height: 3, borderRadius: 999, background: primary }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {slots.author ? (
                <span
                  style={{
                    fontSize: isStory ? 34 : 30,
                    fontWeight: 600,
                  }}
                >
                  {slots.author}
                </span>
              ) : null}
              {slots.role ? (
                <span
                  style={{
                    fontSize: isStory ? 28 : 25,
                    opacity: 0.7,
                    fontWeight: brand.bodyWeight,
                  }}
                >
                  {slots.role}
                </span>
              ) : null}
            </div>
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
            bottom: pad,
            height: isStory ? 56 : 48,
            objectFit: "contain",
            opacity: 0.9,
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `2px solid ${surface === bg ? `${primary}26` : surface}`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
