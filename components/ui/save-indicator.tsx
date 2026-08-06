"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/lib/use-autosave";

/**
 * The "Guardado" / "Guardando…" readout.
 *
 * Deliberately quiet: this is a reassurance, not an announcement, and it sits
 * next to a title that the user is not looking at. `aria-live="polite"` is what
 * makes it reach a screen reader without interrupting anything.
 *
 * Renders nothing when idle — an always-present "Guardado" stops meaning
 * anything, and the point is that the state CHANGES when you type.
 */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const content =
    status === "saving" || status === "pending" ? (
      <>
        <Loader2 className="size-3 animate-spin" />
        Guardando…
      </>
    ) : status === "saved" ? (
      <>
        <Check className="size-3" />
        Guardado
      </>
    ) : (
      <>
        <CircleAlert className="size-3" />
        No se pudo guardar
      </>
    );

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs ${
        status === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {content}
    </span>
  );
}
