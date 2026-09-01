import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
  tailwind-merge has to be told about the design system's type scale.

  Without this it classifies `text-caption` as a text COLOUR — the fallback
  validator for `text-*` accepts any bare word — so the moment a component
  carries both a size and a colour, as every status chip and heading does, the
  two are judged to conflict and the size is dropped. Silently: the class
  vanishes from the DOM, the element inherits 16px, and nothing errors.

  This cost a real debugging pass. `.text-caption` was present in the compiled
  stylesheet with the right `font-size: 12px`, the element simply never carried
  the class. If a size from the scale ever seems not to apply, check whether the
  token was added here before looking anywhere else.

  Keep this list in sync with the `--text-*` tokens in app/globals.css.
*/
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "caption",
            "body-sm",
            "body",
            "subheading",
            "heading-sm",
            "heading",
            "heading-lg",
            "display",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
