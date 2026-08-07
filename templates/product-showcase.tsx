import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const productShowcaseSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(52),
  detail: z.string().trim().max(120),
  cta: z.string().trim().max(24),
});

export type ProductShowcaseSlots = z.infer<typeof productShowcaseSlots>;

/*
  The product on flat brand colour. No generated image at all.

  Three things follow from `usesBackground: false`, and all three are the point:
  the piece costs nothing and takes no queue time, the contrast is guaranteed
  rather than hoped for because the type sits on a known colour, and — the
  reason this exists next to product-hero — it CANNOT look like an AI image,
  because there is no AI image in it. A catalogue-style product post is a real
  format, not a degraded version of the scene one.

  It is also the safe home for a photo that could not be cut out: an opaque
  photograph inside a deliberate frame on a coloured field reads as designed,
  where the same photo floating in a generated scene reads as a mistake.
*/
export function ProductShowcase({
  slots,
  format,
  brand,
  product,
}: TemplateProps<ProductShowcaseSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");
  const surface = token(brand, "surface", `${primary}14`);

  const pad = isStory ? 88 : 76;
  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 82 : 72,
    min: isStory ? 52 : 46,
    from: 20,
    to: 52,
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
        display: "flex",
        flexDirection: "column",
        fontFamily: `'${brand.bodyFamily}', sans-serif`,
      }}
    >
      {/*
        A single large brand-colour shape behind the product. Flat colour alone
        looks like a slide with a picture on it; one geometric field turns it
        into a composition, and it doubles as the ground the product stands on.
      */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: isStory ? "18%" : "14%",
          height: isStory ? "46%" : "48%",
          background: floating ? `${primary}1F` : surface,
        }}
      />

      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${pad}px ${pad}px 0`,
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
                maxWidth: "80%",
                maxHeight: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 28px 44px rgba(0,0,0,0.45))",
              }}
            />
          ) : (
            <div
              style={{
                maxWidth: "80%",
                maxHeight: "100%",
                overflow: "hidden",
                borderRadius: 24,
                boxShadow: "0 28px 56px rgba(0,0,0,0.45)",
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
          <div
            style={{
              width: "64%",
              height: "72%",
              borderRadius: 24,
              border: `2px dashed ${primary}59`,
            }}
          />
        )}
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: isStory ? 20 : 16,
          padding: pad,
        }}
      >
        {product ? (
          <p
            style={{
              margin: 0,
              fontSize: isStory ? 26 : 24,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: primary,
            }}
          >
            {product.name}
          </p>
        ) : null}

        <h1
          style={{
            margin: 0,
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

        {slots.detail ? (
          <p
            style={{
              margin: 0,
              fontSize: isStory ? 30 : 27,
              lineHeight: 1.4,
              fontWeight: brand.bodyWeight,
              opacity: 0.76,
              maxWidth: "92%",
            }}
          >
            {slots.detail}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginTop: isStory ? 12 : 8,
          }}
        >
          {slots.cta ? (
            <div
              style={{
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
          ) : (
            <div style={{ width: 64, height: 4, borderRadius: 999, background: primary }} />
          )}

          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 46 : 40, objectFit: "contain" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
