import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const statementSlots = z.object({
  statement: z.string().trim().min(1, "La frase es obligatoria.").max(150),
  attribution: z.string().trim().max(60),
});

export type StatementSlots = z.infer<typeof statementSlots>;

/*
  No photograph at all. That is the entire point.

  The most reliable way to stop a piece looking AI-generated is to remove the
  generated image from it. A typographic card in the brand's own colours cannot
  have the stock-photo tell, cannot have the six-fingered hand, and cannot look
  like every other agency's output — because what it is made of is the client's
  palette and typeface, which nothing else shares.

  It is also the cheapest and fastest piece in the system: the registry marks it
  `usesBackground: false`, so the queue skips it entirely. In a week of content
  that is one less image to pay for and roughly thirty seconds less waiting.

  `backgroundUrl` is deliberately ignored rather than absent from the props —
  the template contract is uniform, and a slide that once had a background must
  not break when switched to this template.
*/
export function Statement({ slots, format, brand }: TemplateProps<StatementSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 104 : 88;

  // A statement carries the whole card, so it starts far larger than a headline
  // on a photo — and has further to fall, because 150 characters at 96px would
  // not fit at all.
  const size = fitTextSize(slots.statement, {
    max: isStory ? 108 : 96,
    min: isStory ? 52 : 46,
    from: 32,
    to: 150,
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
        justifyContent: "space-between",
        padding: pad,
        fontFamily: `'${brand.bodyFamily}', sans-serif`,
      }}
    >
      {/*
        A single oversized accent shape, bled off the top-right corner. It gives
        the composition somewhere to breathe without adding an image, and it is
        the brand's own colour rather than decoration for its own sake.
      */}
      <div
        style={{
          position: "absolute",
          top: -220,
          right: -220,
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: primary,
          opacity: 0.14,
        }}
      />

      <div style={{ position: "relative", display: "flex", alignItems: "flex-start" }}>
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt=""
            style={{ height: isStory ? 60 : 52, objectFit: "contain" }}
          />
        ) : null}
      </div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ width: 96, height: 8, borderRadius: 999, background: primary }} />

        <p
          style={{
            margin: 0,
            fontFamily: `'${brand.displayFamily}', sans-serif`,
            fontWeight: brand.displayWeight,
            fontSize: size,
            lineHeight: fitLineHeight(size),
            letterSpacing: "-0.025em",
            textWrap: "balance",
          }}
        >
          {slots.statement}
        </p>

        {slots.attribution ? (
          <p
            style={{
              margin: 0,
              fontSize: isStory ? 32 : 28,
              fontWeight: brand.bodyWeight,
              opacity: 0.62,
              letterSpacing: "0.02em",
            }}
          >
            {slots.attribution}
          </p>
        ) : null}
      </div>

      <div style={{ position: "relative", height: isStory ? 40 : 24 }} />
    </div>
  );
}
