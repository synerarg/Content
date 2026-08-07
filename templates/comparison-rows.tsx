import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import { fitLineHeight, fitTextSize } from "@/lib/render/fit-text";
import type { TemplateProps } from "./types";

export const comparisonRowsSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(70),
  row_1_label: z.string().trim().max(28),
  row_1_value: z.string().trim().max(16),
  row_2_label: z.string().trim().max(28),
  row_2_value: z.string().trim().max(16),
  row_3_label: z.string().trim().max(28),
  row_3_value: z.string().trim().max(16),
  mine_label: z.string().trim().min(1, "La fila de la marca es obligatoria.").max(28),
  mine_value: z.string().trim().min(1, "El valor de la marca es obligatorio.").max(16),
  footnote: z.string().trim().max(120),
});

export type ComparisonRowsSlots = z.infer<typeof comparisonRowsSlots>;

/*
  The comparison, with the brand's row last and winning.

  Structure taken from how fintechs actually advertise a price advantage: a
  stack of rows, each a competitor and a number, and the brand's own row at the
  bottom in a colour that makes the answer obvious before anything is read. The
  argument is made by the LAYOUT — you understand it from across a room, which
  is the whole job of a feed post.

  Three things make it work rather than look like a table:

    1. The rows WIDEN as they descend. The eye is led to the last one before it
       reads any of them. Same trick as a bar chart sorted ascending.
    2. Competitors are muted, not hidden. A comparison that renders rivals
       illegibly reads as a trick; the point is that the reader checks.
    3. The footnote exists. Every real ad of this shape carries the condition
       that makes the comparison true ("comisiones al recibir US$6.000 por
       ACH"), and a claim without it is one a client should not publish.

  No generated image: the registry marks it `usesBackground: false`. The depth
  comes from a radial wash of the brand's own accent, which costs nothing, takes
  no time, and cannot look AI-generated.
*/
export function ComparisonRows({
  slots,
  format,
  brand,
}: TemplateProps<ComparisonRowsSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 88 : 72;

  const headlineSize = fitTextSize(slots.headline, {
    max: isStory ? 86 : 74,
    min: isStory ? 52 : 46,
    from: 22,
    to: 70,
  });

  const others = [
    { label: slots.row_1_label, value: slots.row_1_value },
    { label: slots.row_2_label, value: slots.row_2_value },
    { label: slots.row_3_label, value: slots.row_3_value },
  ].filter((row) => row.label.trim().length > 0);

  const rows = [
    ...others.map((row) => ({ ...row, mine: false })),
    { label: slots.mine_label, value: slots.mine_value, mine: true },
  ];

  const rowPadY = isStory ? 30 : 26;
  const labelSize = isStory ? 40 : 35;
  const valueSize = isStory ? 46 : 40;

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
      {/* The accent, as light rather than as a block of colour. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(115% 80% at 50% 12%, ${primary}33 0%, ${primary}0D 45%, ${bg}00 72%)`,
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
        <div style={{ display: "flex", justifyContent: "center" }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              style={{ height: isStory ? 60 : 52, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 56 : 44 }}>
          <h1
            style={{
              margin: 0,
              textAlign: "center",
              fontFamily: `'${brand.displayFamily}', sans-serif`,
              fontWeight: brand.displayWeight,
              fontSize: headlineSize,
              lineHeight: fitLineHeight(headlineSize),
              letterSpacing: "-0.025em",
              textWrap: "balance",
            }}
          >
            {slots.headline}
          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 18 : 14 }}>
            {rows.map((row, index) => {
              // Each row a little wider than the one above it, so the stack
              // funnels down into the brand's own.
              const width = `${Math.round(78 + (index * 22) / Math.max(1, rows.length - 1))}%`;

              return (
                <div
                  key={index}
                  style={{
                    alignSelf: "flex-end",
                    width,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 24,
                    padding: `${rowPadY}px ${isStory ? 36 : 30}px`,
                    borderRadius: isStory ? 26 : 22,
                    background: row.mine ? `${primary}24` : `${fg}0A`,
                    border: row.mine
                      ? `2px solid ${primary}`
                      : `1px solid ${fg}1F`,
                  }}
                >
                  <span
                    style={{
                      fontSize: labelSize,
                      fontWeight: brand.bodyWeight,
                      opacity: row.mine ? 1 : 0.55,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontFamily: `'${brand.displayFamily}', sans-serif`,
                      fontWeight: brand.displayWeight,
                      fontSize: valueSize,
                      letterSpacing: "-0.02em",
                      whiteSpace: "nowrap",
                      color: row.mine ? primary : fg,
                      opacity: row.mine ? 1 : 0.55,
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/*
          The condition that makes the comparison true. Small on purpose — it is
          not the message — but present, because a comparison without it is a
          claim the client is the one who answers for.
        */}
        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: isStory ? 24 : 21,
            lineHeight: 1.35,
            opacity: 0.45,
            minHeight: isStory ? 34 : 30,
          }}
        >
          {slots.footnote}
        </p>
      </div>
    </div>
  );
}
