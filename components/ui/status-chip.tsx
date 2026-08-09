import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The one pill for reporting a short, discrete state — "Listo", "Error",
  "Legible · 4.5:1". Before this, the same idea existed twice with slightly
  different padding, icon sizes and tone rules (queue-progress.tsx's
  SlideStatusChip and legibility-report.tsx's LegibilityChip), and neither
  transitioned when the state it reported changed.

  This is for short in-flow labels only. A sentence-length status ("PNG
  guardado desactualizado — la placa cambió desde entonces") is not a chip;
  it stays plain text or its own bordered block, same as a failed-generation
  error message. Forcing prose into a pill is how you get a pill that wraps.
*/

export type ChipTone = "neutral" | "accent" | "destructive";

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: "border-border text-muted-foreground",
  accent:
    "border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] text-[var(--synera-accent)]",
  destructive: "border-destructive/30 text-destructive",
};

export function StatusChip({
  tone,
  icon: Icon,
  spin = false,
  children,
  className,
  title,
}: {
  tone: ChipTone;
  icon?: LucideIcon;
  /** Spins the icon — for an in-progress state, e.g. Loader2. */
  spin?: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tabular-nums transition-colors duration-150 ease-(--ease-out)",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon className={cn("size-3.5 shrink-0", spin && "animate-spin")} />
      ) : null}
      {children}
    </span>
  );
}
