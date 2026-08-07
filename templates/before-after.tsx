import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const beforeAfterSlots = z.object({
  before: z.string().trim().min(1, "El 'antes' es obligatorio.").max(60),
  after: z.string().trim().min(1, "El 'después' es obligatorio.").max(60),
  support: z.string().trim().max(140),
  cta: z.string().trim().max(24),
});

export type BeforeAfterSlots = z.infer<typeof beforeAfterSlots>;

/*
  The old way struck through, the new one underneath.

  Two lines and a rule drawn across the first: the entire argument is legible
  before a word is read, which is what makes it work at feed-scroll speed. The
  copy has to be written as a PAIR — "5 herramientas de IA" / "1 suscripción" —
  so the hint tells the author that, because the format collapses the moment the
  two lines are not the same kind of thing.

  The strike is drawn as a bar, not `text-decoration: line-through`. Two
  reasons, and the second is the load-bearing one: the thickness and colour are
  controllable, so it stays visible over the brand's own palette; and the
  decoration's rendering inside html-to-image's `<foreignObject>` is one more
  thing that would have to be verified in the exported PNG, while an absolutely
  positioned div is the same geometry the rest of the system already relies on.

  A multi-line `before` gets one bar across the block rather than one per line.
  That is a deliberate limitation and the 60-character cap keeps it honest.

  No generated image: this is `usesBackground: false`, so it costs nothing and
  renders instantly.
*/
export function BeforeAfter({
  slots,
  format,
  brand,
}: TemplateProps<BeforeAfterSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const onPrimary = token(brand, "on-primary", bg);

  const pad = isStory ? 96 : 80;

  const beforeSize = fitTextSize(slots.before, {
    max: isStory ? 82 : 70,
    min: isStory ? 46 : 40,
    from: 18,
    to: 60,
  });
  const afterSize = fitTextSize(slots.after, {
    max: isStory ? 116 : 100,
    min: isStory ? 60 : 52,
    from: 16,
    to: 60,
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(100% 55% at 50% 78%, ${primary}1F 0%, ${bg}00 62%)`,
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
              style={{ height: isStory ? 60 : 52, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 26 : 20 }}>
          <div style={{ position: "relative", alignSelf: "flex-start" }}>
            <p
              style={{
                margin: 0,
                fontFamily: `'${brand.displayFamily}', sans-serif`,
                fontWeight: brand.displayWeight,
                fontSize: beforeSize,
                lineHeight: fitLineHeight(beforeSize),
                letterSpacing: "-0.02em",
                opacity: 0.42,
              }}
            >
              {slots.before}
            </p>
            {/* The bar, at the optical middle of the block. */}
            <div
              style={{
                position: "absolute",
                left: `-${Math.round(beforeSize * 0.06)}px`,
                right: `-${Math.round(beforeSize * 0.06)}px`,
                top: "50%",
                height: Math.max(4, Math.round(beforeSize * 0.075)),
                borderRadius: 999,
                background: fg,
                opacity: 0.42,
              }}
            />
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: `'${brand.displayFamily}', sans-serif`,
              fontWeight: brand.displayWeight,
              fontSize: afterSize,
              lineHeight: fitLineHeight(afterSize),
              letterSpacing: "-0.03em",
              textWrap: "balance",
            }}
          >
            {slots.after}
          </h1>

          {slots.support ? (
            <p
              style={{
                margin: 0,
                marginTop: isStory ? 12 : 8,
                fontSize: isStory ? 34 : 30,
                lineHeight: 1.4,
                fontWeight: brand.bodyWeight,
                opacity: 0.72,
                maxWidth: "86%",
              }}
            >
              {slots.support}
            </p>
          ) : null}

          {slots.cta ? (
            <div
              style={{
                alignSelf: "flex-start",
                marginTop: isStory ? 20 : 14,
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

        <div style={{ height: isStory ? 40 : 24 }} />
      </div>
    </div>
  );
}
