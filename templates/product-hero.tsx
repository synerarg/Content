import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const productHeroSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(64),
  detail: z.string().trim().max(80),
  cta: z.string().trim().max(24),
});

export type ProductHeroSlots = z.infer<typeof productHeroSlots>;

/*
  The product, photographed for real, standing in a generated scene.

  This is the piece the whole products feature exists for, and it only works
  because of a division of labour: the image model produces a surface, a light
  and an empty middle — it is told explicitly not to put an object there — and
  the client's own pixels are laid into that space by this component. A model
  asked to draw the product from a reference instead redraws it, and a redrawn
  label is gibberish at any resolution.

  The type deliberately does NOT sit over the product. Headline at the top,
  facts at the bottom, the product owning the middle: it is a product ad, so the
  product is the subject and the copy frames it.

  Without a cut-out the product is presented as a FRAMED PHOTOGRAPH instead of
  floating in the scene. That branch is not a fallback nobody will hit — plenty
  of client photos are shot on a desk and cannot be cut out — and pasting an
  opaque rectangle onto a generated scene is the single most obvious way to make
  a piece look broken.
*/
export function ProductHero({
  slots,
  format,
  brand,
  backgroundUrl,
  product,
}: TemplateProps<ProductHeroSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 88 : 76;
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 76 : 68,
    min: isStory ? 48 : 44,
    from: 22,
    to: 64,
  });

  const floating = product?.hasTransparency ?? false;

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
        Two scrims, not one. A single bottom gradient is the look every other
        template in this registry already has; here the type lives at both ends,
        so each end gets its own falloff and the middle — where the product is —
        stays untouched.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, ${bg}D9 0%, ${bg}00 34%, ${bg}00 58%, ${bg}E6 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          padding: pad,
        }}
      >
        <h1
          style={{
            margin: 0,
            maxWidth: "88%",
            fontFamily: `'${brand.displayFamily}', sans-serif`,
            fontWeight: brand.displayWeight,
            fontSize: headlineSize,
            lineHeight: fitLineHeight(headlineSize),
            letterSpacing: "-0.02em",
            textWrap: "balance",
          }}
        >
          {slots.headline}
        </h1>

        {/* The product owns the middle band, at its own aspect ratio. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: `${isStory ? 56 : 40}px 0`,
            minHeight: 0,
          }}
        >
          {product ? (
            floating ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.url}
                alt=""
                style={{
                  maxWidth: "82%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  // Grounds the cut-out in the scene. Without it the product
                  // reads as a sticker sitting on top of a photograph.
                  filter: `drop-shadow(0 ${isStory ? 40 : 32}px ${isStory ? 56 : 44}px rgba(0,0,0,0.55))`,
                }}
              />
            ) : (
              <div
                style={{
                  maxWidth: "78%",
                  maxHeight: "100%",
                  overflow: "hidden",
                  borderRadius: 28,
                  border: `2px solid ${primary}66`,
                  boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
                  display: "flex",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )
          ) : (
            // No product yet: the staging area reads as reserved rather than as
            // a hole, so the layout looks finished while the piece is in progress.
            <div
              style={{
                width: "62%",
                height: "70%",
                borderRadius: 28,
                border: `2px dashed ${primary}59`,
                background: `${primary}0F`,
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {product ? (
              <p
                style={{
                  margin: 0,
                  fontSize: isStory ? 34 : 30,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {product.name}
              </p>
            ) : null}

            {slots.detail ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: isStory ? 28 : 25,
                  lineHeight: 1.35,
                  fontWeight: brand.bodyWeight,
                  opacity: 0.76,
                }}
              >
                {slots.detail}
              </p>
            ) : null}
          </div>

          {slots.cta ? (
            <div
              style={{
                flexShrink: 0,
                background: primary,
                color: token(brand, "on-primary", bg),
                fontWeight: 600,
                fontSize: isStory ? 28 : 25,
                padding: "16px 30px",
                borderRadius: 999,
              }}
            >
              {slots.cta}
            </div>
          ) : brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 46 : 40, objectFit: "contain", flexShrink: 0 }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
