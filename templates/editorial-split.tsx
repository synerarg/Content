import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLetterSpacing, fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const editorialSplitSlots = z.object({
  eyebrow: z.string().trim().max(28),
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(90),
  subline: z.string().trim().max(180),
});

export type EditorialSplitSlots = z.infer<typeof editorialSplitSlots>;

/*
  The image is a BAND, not the background.

  Every other template in this registry is the same composition: full-bleed
  photo, gradient scrim, type at the bottom left. Six variations of one idea
  read as one template, and the scrim-over-photo look is the most recognisable
  "made by a tool" signal there is.

  Here the photo occupies a defined region and the type sits on a solid brand
  field. Three things follow from that: no scrim is needed, so no muddy
  gradient; the type is on a known colour, so contrast is guaranteed rather than
  hoped for; and a mediocre photo hurts far less, because it is a component of
  the layout instead of the whole thing.
*/
export function EditorialSplit({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<EditorialSplitSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  // The story is 570px taller at the same width. Giving the image the same
  // PROPORTION would make it enormous; it gets a smaller share instead, so the
  // type block stays the anchor in both formats.
  const imageShare = isStory ? "52%" : "58%";
  const pad = isStory ? 88 : 76;

  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 86 : 76,
    min: isStory ? 54 : 48,
    from: 28,
    to: 90,
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
        display: "flex",
        flexDirection: "column",
        fontFamily: `'${brand.bodyFamily}', sans-serif`,
      }}
    >
      <div style={{ position: "relative", height: imageShare, flexShrink: 0 }}>
        {backgroundUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          // No photo yet: a flat block in the brand colour rather than a hole.
          // The layout has to read as finished while the queue is still running.
          <div style={{ width: "100%", height: "100%", background: `${primary}1A` }} />
        )}

        {slots.eyebrow ? (
          <div
            style={{
              position: "absolute",
              left: pad,
              bottom: 0,
              transform: "translateY(50%)",
              background: primary,
              color: token(brand, "on-primary", bg),
              fontWeight: 600,
              fontSize: isStory ? 26 : 24,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "14px 26px",
              borderRadius: 999,
            }}
          >
            {slots.eyebrow}
          </div>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: isStory ? 32 : 26,
          padding: pad,
          paddingTop: slots.eyebrow ? pad + 24 : pad,
        }}
      >
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
              fontSize: isStory ? 36 : 32,
              lineHeight: 1.4,
              fontWeight: brand.bodyWeight,
              opacity: 0.78,
              maxWidth: "92%",
            }}
          >
            {slots.subline}
          </p>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: "auto" }}>
          <div style={{ width: 64, height: 4, borderRadius: 999, background: primary }} />
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 48 : 42, objectFit: "contain" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
