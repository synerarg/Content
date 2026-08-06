"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { CircleHelp } from "lucide-react";

/**
 * Field-level help, on the non-obvious fields only.
 *
 * The heuristics spec is explicit that this is for fields whose meaning is not
 * self-evident — art direction, tone of voice, seed — with one concrete example
 * each. A help icon on every field trains people to ignore all of them.
 *
 * The trigger is a real `<button type="button">`, not a bare icon: it has to be
 * reachable by keyboard (Radix opens the tooltip on focus), and inside a form
 * an unqualified button submits it.
 */
export function HelpTip({
  children,
  label = "Ayuda",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0"
          >
            {children}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
