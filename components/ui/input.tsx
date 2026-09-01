import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  spellCheck = false,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      spellCheck={spellCheck}
      data-slot="input"
      className={cn(
        /*
          6px radius and a frost fill, per the reference's Text Input.

          The `dark:` overrides the scaffold shipped are gone rather than
          retuned. This app is dark-only — <html> carries the class
          unconditionally — so every one of them fired on every render, and a
          second opinion about the background that always wins is not a dark
          mode, it is a hidden default.

          Focus deliberately does NOT follow the reference here: it specifies
          lifting the border from 0.12 to 0.24 alpha, which is close to
          invisible. See globals.css deviation (3).
        */
        "h-8 w-full min-w-0 rounded-md border border-input bg-muted px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-moon-mist/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
