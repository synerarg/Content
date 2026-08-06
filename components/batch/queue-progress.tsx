"use client";

import { useEffect, useState } from "react";
import { CircleAlert, ImageIcon, Loader2, Pause, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  BackgroundStatus,
  SlideQueueState,
} from "@/lib/batch/use-background-queue";

/*
  The queue's status line.

  Every number here is derived from the slide states, which live in the
  database — so this reads the same after a reload, or from a second device,
  as it did while the run was going.
*/

export function countByStatus(states: SlideQueueState[]) {
  const counts: Record<BackgroundStatus, number> = {
    pending: 0,
    queued: 0,
    running: 0,
    ready: 0,
    failed: 0,
  };
  for (const state of states) counts[state.status]++;
  return counts;
}

function formatEta(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.round(seconds / 60)} min`;
}

/** Live countdown while the queue is holding off for a rate limit. */
function RateLimitCountdown({ until }: { until: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((until - Date.now()) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [until]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Timer className="size-3.5" />
      Límite de la API — sigue en {remaining}s
    </span>
  );
}

export function QueueProgress({
  states,
  running,
  waitingUntil,
  etaMs,
  onStart,
  onPause,
  onRetryFailed,
}: {
  states: SlideQueueState[];
  running: boolean;
  waitingUntil: number | null;
  etaMs: number | null;
  onStart: () => void;
  onPause: () => void;
  onRetryFailed: () => void;
}) {
  const total = states.length;
  const counts = countByStatus(states);
  const done = counts.ready;
  const outstanding = total - done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm">
            <span className="font-medium tabular-nums">
              {done}/{total}
            </span>{" "}
            <span className="text-muted-foreground">fondos listos</span>
            {counts.failed > 0 ? (
              <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                <CircleAlert className="size-3.5" />
                {counts.failed} con error
              </span>
            ) : null}
          </p>

          {waitingUntil ? (
            <RateLimitCountdown until={waitingUntil} />
          ) : running ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Generando
              {etaMs !== null ? ` · quedan ${formatEta(etaMs)}` : null}
            </span>
          ) : outstanding > 0 ? (
            <span className="text-xs text-muted-foreground">
              {outstanding} placa{outstanding === 1 ? "" : "s"} sin fondo.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Todas las placas tienen fondo.
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {counts.failed > 0 && !running ? (
            <Button variant="outline" size="sm" onClick={onRetryFailed}>
              Reintentar {counts.failed}
            </Button>
          ) : null}

          {running ? (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="size-4" />
              Pausar
            </Button>
          ) : outstanding > 0 ? (
            <Button variant="secondary" size="sm" onClick={onStart}>
              {done > 0 ? <Play className="size-4" /> : <ImageIcon className="size-4" />}
              {done > 0
                ? `Seguir con ${outstanding}`
                : `Generar ${outstanding} fondo${outstanding === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Fondos generados"
      >
        <div
          className="h-full rounded-full bg-[var(--synera-accent)] transition-[width] duration-500"
          style={{
            width: `${percent}%`,
            boxShadow: percent > 0 ? "0 0 8px var(--synera-accent)" : undefined,
          }}
        />
      </div>

      {running ? (
        <p className="text-xs text-muted-foreground">
          Dejá esta pestaña abierta: la cola corre desde el navegador. Si la
          cerrás, lo generado queda guardado y podés seguir después.
        </p>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<BackgroundStatus, string> = {
  pending: "Sin fondo",
  queued: "En cola",
  running: "Generando",
  ready: "Listo",
  failed: "Error",
};

const STATUS_TONE: Record<BackgroundStatus, string> = {
  pending: "border-border text-muted-foreground",
  queued: "border-border text-muted-foreground",
  running:
    "border-[color-mix(in_oklch,var(--synera-accent)_35%,transparent)] text-[var(--synera-accent)]",
  ready: "border-border text-muted-foreground",
  failed: "border-destructive/30 text-destructive",
};

/** Per-slide state chip, shown under each preview. */
export function SlideStatusChip({ state }: { state: SlideQueueState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[state.status]}`}
    >
      {state.status === "running" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : state.status === "failed" ? (
        <CircleAlert className="size-3" />
      ) : null}
      {STATUS_LABEL[state.status]}
    </span>
  );
}
