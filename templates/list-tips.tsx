import { z } from "zod";
import { token } from "@/lib/render/brand-tokens";
import type { TemplateProps } from "./types";

export const listTipsSlots = z.object({
  title: z.string().trim().min(1, "El título es obligatorio.").max(70),
  item_1: z.string().trim().max(90),
  item_2: z.string().trim().max(90),
  item_3: z.string().trim().max(90),
});

export type ListTipsSlots = z.infer<typeof listTipsSlots>;

export function ListTips({
  slots,
  format,
  brand,
  backgroundUrl,
}: TemplateProps<ListTipsSlots>) {
  const isStory = format === "story";

  const bg = token(brand, "bg", "#0b0d10");
  const fg = token(brand, "fg", "#ffffff");
  const primary = token(brand, "primary", "#84e9ff");

  const pad = isStory ? 96 : 80;
  const titleSize = isStory ? 72 : 62;
  const itemSize = isStory ? 38 : 33;

  // Empty slots are skipped rather than rendered blank, so a two-item list
  // still looks composed instead of leaving a hole.
  const items = [slots.item_1, slots.item_2, slots.item_3].filter((item) =>
    item?.trim(),
  );

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
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, ${bg}E0 0%, ${bg}F5 100%)`,
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
          gap: isStory ? 56 : 44,
          padding: pad,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: `'${brand.displayFamily}', sans-serif`,
            fontWeight: brand.displayWeight,
            fontSize: titleSize,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
            textWrap: "balance",
            maxWidth: "92%",
          }}
        >
          {slots.title}
        </h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: isStory ? 32 : 26,
          }}
        >
          {items.map((item, index) => (
            <div
              key={index}
              style={{ display: "flex", alignItems: "flex-start", gap: 22 }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: isStory ? 52 : 46,
                  height: isStory ? 52 : 46,
                  borderRadius: 999,
                  border: `2px solid ${primary}`,
                  color: primary,
                  fontWeight: 600,
                  fontSize: isStory ? 26 : 23,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {index + 1}
              </span>
              <span
                style={{
                  fontSize: itemSize,
                  lineHeight: 1.32,
                  fontWeight: brand.bodyWeight,
                  paddingTop: isStory ? 6 : 4,
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt=""
          style={{
            position: "absolute",
            right: pad,
            bottom: pad,
            height: isStory ? 52 : 44,
            objectFit: "contain",
            opacity: 0.85,
          }}
        />
      ) : null}
    </div>
  );
}
