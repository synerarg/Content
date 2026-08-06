"use client";

import { useEffect, useState } from "react";

/**
 * Elapsed time for a long operation, with the range it usually takes.
 *
 * Held back until `showAfterMs` on purpose: a counter that appears instantly
 * makes a two-second wait feel like something is wrong. It earns its place only
 * once the wait is long enough that the user starts wondering, and the expected
 * range is what turns "18s" from alarming into normal.
 */
export function Elapsed({
  startedAt,
  expected,
  showAfterMs = 5000,
}: {
  startedAt: number | null;
  /** Human range, e.g. "suele tardar 10-20 s". */
  expected?: string;
  showAfterMs?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return null;
  const elapsed = now - startedAt;
  if (elapsed < showAfterMs) return null;

  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      {Math.round(elapsed / 1000)}s{expected ? ` · ${expected}` : null}
    </p>
  );
}
