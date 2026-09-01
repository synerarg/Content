import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
  Every button is a pill, and every button carries a hairline.

  Two notes on how this reads the AuthKit reference, because it contradicts
  itself once and is silent once:

  CONTRADICTION. The Violet CTA is specified at 6px radius, but the rules say
  "use 999px radius for all interactive elements" and "do not mix radius
  families on the same component type — every button is pill". The 6px is an
  artefact of that button living inside an auth form, aligned to the 6px inputs
  above it. The rule is the normative statement, so every button here is a
  pill, violet included.

  SILENCE. The reference has no link colour, because its only link is a pill.
  Violet is the action colour and nothing else (see globals.css deviation 1),
  so a text link is Frost Glow — the value the reference already assigns to
  "primary text fill for body and links".
*/
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-(--ease-out) outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one loud action per screen. No hairline: a filled surface does
        // not need an edge, and adding one muddies the only solid fill here.
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        // Pill Button (Outlined): transparent, hairline, frost text.
        outline:
          "border-border text-frost-glow hover:bg-accent hover:text-pure-white aria-expanded:bg-accent aria-expanded:text-pure-white",
        // Pill Button (Primary Ghost): the reference's default button — a
        // faint frost wash that lightens to 0.12 on hover.
        secondary:
          "border-border bg-accent text-pure-white hover:bg-luminous-fill aria-expanded:bg-luminous-fill",
        ghost:
          "hover:bg-accent hover:text-pure-white aria-expanded:bg-accent aria-expanded:text-pure-white",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-frost-glow underline-offset-4 hover:underline",
      },
      /*
        Heights stay on the existing dense scale — see globals.css deviation
        (4). Only the horizontal padding grows, because a pill needs its ends
        to clear the curve or the label looks pinched against it.
      */
      size: {
        default:
          "h-8 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        // Icon-only buttons are circles, which is the pill rule at 1:1.
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
