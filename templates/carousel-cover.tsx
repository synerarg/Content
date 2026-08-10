import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const carouselCoverSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(80),
  subline: z.string().trim().max(120),
  swipe_hint: z.string().trim().max(24),
});

export type CarouselCoverSlots = z.infer<typeof carouselCoverSlots>;

/*
  Text at the top, photo carrying the bottom two-thirds — the opposite of
  bold-headline and story-cta, which both anchor their whole stack to the
  bottom behind a bottom-loaded scrim. Three templates under this registry
  had converged on that exact recipe with different labels on the same
  shape, which is what the redesign audit flagged: a carousel's own job —
  promise what the next slides develop, then get out of the way for the
  swipe — is better served by leading with the promise and leaving the photo
  uncovered exactly where the swipe gesture happens, instead of another
  bottom-left stack.
*/
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
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 100 : 86,
    min: isStory ? 56 : 48,
    from: 26,
    to: 80,
  });
  const sublineSize = fitTextSize(slots.subline, {
    max: isStory ? 38 : 33,
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

      {/* Top-loaded, the mirror of bold-headline's bottom-loaded scrim.
          Fully clear by 58% down, so the lower two-fifths of the photo —
          where the swipe pill sits and where a thumb actually is — stays
          uncovered. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${bg}F2 0%, ${bg}D9 20%, ${bg}59 42%, ${bg}00 58%, ${bg}00 100%)`,
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
        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 30 : 24 }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 56 : 48, objectFit: "contain" }}
            />
          ) : null}

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
                opacity: 0.82,
                fontWeight: brand.bodyWeight,
                maxWidth: "86%",
              }}
            >
              {slots.subline}
            </p>
          ) : null}
        </div>

        {/* The swipe affordance is what separates a cover from a single
            post — kept at the bottom, in the clear part of the frame, where
            the gesture it names actually happens. */}
        {slots.swipe_hint ? (
          <div
            style={{
              alignSelf: "flex-end",
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
    </div>
  );
}
