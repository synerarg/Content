---
name: plantilla
description: Add or change a slide template (plantilla, placa) in Synera Content Studio — the component, its zod slot schema, the registry entry, sample copy and the image-prompt composition guidance. Use when asked to create a new template, change an existing one's layout or slots, or turn a design reference into a template.
---

# Adding a template

A template is one React component plus one zod schema, registered once. The
schema is the **single source of truth**: it generates the editor's inputs, it
becomes the JSON schema Claude fills in, and its `.min(1)` checks are what the
export gate reads to decide whether a slide is complete. One definition, three
consumers, no drift.

## The files

| Where | What |
|---|---|
| `templates/<slug>.tsx` | the component and its exported `<slug>Slots` schema |
| `templates/registry.ts` | the `TEMPLATES` entry, and a `TEMPLATE_SAMPLES` entry |
| `prompts/image-prompt.ts` | a `COMPOSITION_BY_TEMPLATE` line — **required** if it uses a background |

Nothing else. The editor, the picker, the gallery, the batch generator and the
export gate all read the registry.

## 1. The schema

```ts
export const boldHeadlineSlots = z.object({
  headline: z.string().trim().min(1, "El titular es obligatorio.").max(90),
  subline: z.string().trim().max(140),
  cta: z.string().trim().max(24),
});
```

- **`.min(1, "…")` means required.** `isSlotRequired` reflects on it, so that
  single call decides what the editor marks, what Claude must fill and what the
  export refuses to rasterize without. Nothing else declares requiredness.
- **`.max(n)` is read by the batch generator** to build Claude's structured
  output limits. Set it to what actually fits at the smallest font size the
  template will fall to — not to a round number.
- Keys are English identifiers because they are also JSON keys. They are never
  shown to a person; `slotLabels` handles that.

## 2. The component

Signature is always `({ slots, format, brand, backgroundUrl, product })`.

Hard rules, each with a reason that has already cost something:

- **Never hardcode a colour.** Read tokens: `token(brand, "primary", "#84e9ff")`.
  The fallback is only for a brand missing that token.
- **Never hardcode a font.** `brand.displayFamily` / `brand.bodyFamily` with
  their weights. The export embeds the brand's real `.woff2`; a hardcoded family
  silently ships a system face in the PNG.
- **Size type with `fitTextSize`** on any slot the user fills freely. The four
  newest templates do; the earliest ones still carry fixed sizes and read as
  "text poured into a box" at full length. New templates use the scale:
  ```ts
  const size = fitTextSize(slots.statement, {
    max: isStory ? 108 : 96, min: isStory ? 52 : 46, from: 32, to: 150,
  });
  ```
  paired with `lineHeight: fitLineHeight(size)`. A template that overflows at
  120 characters is a template that will overflow in front of a client.
- **Branch on `format`**, don't scale. `const isStory = format === "story"` and
  give story its own padding and sizes. Feed is 1080×1350, story 1080×1920.
- **On story, keep the bottom clear.** The thumb and Instagram's own UI live
  there; `story-cta` puts the CTA above it deliberately.
- **`backgroundUrl` may be null** — render flat, never a broken image.
- **Products composite, never regenerate.** If the template uses one, branch on
  `product.hasTransparency`: an opaque photo dropped on a generated scene is a
  white rectangle pasted over a photograph, so present it as a deliberately
  framed image instead. Degrading on purpose beats degrading by accident.
- **Inline styles, not Tailwind classes**, inside templates. The rasterizer
  serializes computed style through `<foreignObject>`; keep it self-contained.

## 3. The registry entry

```ts
{
  slug: "bold-headline",
  name: "Titular protagonista",        // Spanish, what an account manager calls it
  description: "Una afirmación fuerte sobre la imagen. Para ganchos, datos y anuncios.",
  role: "single",                       // "single" | "cover" | "body"
  formats: ["feed", "story"],
  slots: boldHeadlineSlots,
  slotLabels: { headline: "Titular", ... },   // EVERY slot. Asserted.
  slotHints:  { headline: "El gancho. Una idea sola…", ... },
  component: BoldHeadline,
}
```

Three optional flags, each changing behaviour in more than one place — which is
why they live here and not in each screen:

- **`usesBackground: false`** — the template ignores `backgroundUrl`. The queue
  skips the paid image entirely and the export stops waiting for one. Set it on
  anything purely typographic. This is a *feature*: the fastest, cheapest pieces
  in the system are the ones with no generated image, and they never look AI-made.
- **`usesProduct: true`** — the piece needs a product chosen before it is
  complete, the export refuses to rasterize without one, and the scene prompt
  switches to asking for an empty staging area.
- **`requiresCutout: true`** — informational only, surfaced by the picker before
  generation. Never a hard block.

`role` drives carousel assembly: exactly one `cover` followed by N `body`.
`single` templates stand alone.

Also add a `TEMPLATE_SAMPLES` entry — real-sounding Rioplatense copy, at
realistic length. The gallery renders it, so a lazy sample makes the template
look bad to whoever is choosing.

## 4. The composition line

If `usesBackground` is not false, add a `COMPOSITION_BY_TEMPLATE` entry in
`prompts/image-prompt.ts`. **`verify:products` asserts this exists** — without
it the model composes freely and the type lands on the busiest part of the
frame.

It describes where the type will sit, in photographic terms:

> "the subject sits in the upper two thirds. The lower third is visually calm
> and uncluttered — soft gradient, shadow or shallow depth of field — so
> overlaid type stays readable. Leave clear negative space at the bottom."

Say what the frame should *be*, not what to avoid. Prompts that are lists of
prohibitions tend to produce exactly what they forbid.

## 5. Check it

```bash
npm run verify:products && npm run verify:legibility && npx tsc --noEmit && npm run lint
```

`verify:products` holds the registry invariants: every slot has a Spanish label,
every template has at least one required slot, every background-using template
has a composition line, and the `usesProduct` flags agree with the derived lists.

Then **look at it**. Render the template at both formats with the sample copy
and the longest string its `.max()` allows. A template is a design object; the
assertions only prove it is wired up.

## Working from a design reference

When turning a reference (a screenshot, an ad, a competitor's post) into a
template: **take the structure, never the brand.** What transfers is the
skeleton — a comparison table where one row wins, a number at enormous scale
with everything else tiny, a struck-through line above its replacement. What
does not transfer is anyone's logo, typeface, palette or wording; those come
from the client's Brand Kit at render time, which is the entire point of the
system.

Name the structure in `description` so the picker explains itself: "Comparativa
— filas apiladas donde la fila de la marca gana."
