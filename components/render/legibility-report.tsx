"use client";

import { Eye, TriangleAlert } from "lucide-react";
import type { LegibilityReport } from "@/lib/render/legibility";
import { cn } from "@/lib/utils";

/*
  A WARNING, never a block.

  The export gate refuses things that are missing — a slide with no background,
  an empty required slot — because those are unfinished, not decisions. Contrast
  is a judgement: an art director may genuinely want type that sits quietly into
  a photograph, and a tool that refuses to export it is a tool that gets worked
  around. So this says what it measured and gets out of the way.
*/

export function LegibilityChip({
  report,
  className,
}: {
  report: LegibilityReport | null;
  className?: string;
}) {
  if (!report) return null;

  if (report.empty) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Sin texto para medir
      </span>
    );
  }

  const failing = report.findings.filter((finding) => !finding.ok).length;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tabular-nums",
        report.ok
          ? "border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] text-[var(--synera-accent)]"
          : "border-destructive/30 text-destructive",
        className,
      )}
      title={
        report.worst
          ? `Peor caso: "${report.worst.label}" con ${report.worst.ratio}:1 (necesita ${report.worst.required}:1)`
          : undefined
      }
    >
      {report.ok ? (
        <Eye className="size-3.5" />
      ) : (
        <TriangleAlert className="size-3.5" />
      )}
      {report.ok
        ? `Legible · ${report.worst?.ratio ?? "?"}:1`
        : `${failing} texto${failing === 1 ? "" : "s"} con poco contraste`}
    </span>
  );
}

/** The full breakdown, for when the chip is not enough. */
export function LegibilityDetails({ report }: { report: LegibilityReport | null }) {
  if (!report || report.empty || report.findings.length === 0) return null;

  return (
    <ul className="space-y-1">
      {report.findings.map((finding, index) => (
        <li
          key={`${finding.label}-${index}`}
          className={cn(
            "flex items-baseline justify-between gap-3 text-[11px]",
            finding.ok ? "text-muted-foreground" : "text-destructive",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{finding.label}</span>
          <span className="shrink-0 tabular-nums">
            {finding.ratio}:1 / {finding.required}:1
          </span>
        </li>
      ))}
    </ul>
  );
}
