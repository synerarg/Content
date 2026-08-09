"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { clearBatchSchedule, scheduleBatch } from "@/app/(app)/contenido/actions";
import {
  CADENCE_OPTIONS,
  DEFAULT_TIME,
  distributeSchedule,
  parseDay,
  today,
  type CadenceId,
} from "@/lib/schedule";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Past this many dates, the preview names the first few and counts the rest
 * instead of joining every date into one unbounded line. */
const PREVIEW_DATES_SHOWN = 5;

/**
 * Spread a whole batch across the calendar.
 *
 * The panel PREVIEWS the days it is about to use, live, before anything is
 * written. That is not decoration: "saltear fines de semana" silently moves
 * dates, and a control whose effect you only discover afterwards — on a
 * calendar, in another screen — is how people stop trusting the button. Showing
 * the actual days makes every option self-explanatory and removes the need to
 * undo.
 */
export function SchedulePanel({
  batchId,
  postCount,
  scheduledCount,
  onScheduled,
  onCleared,
}: {
  batchId: string;
  postCount: number;
  scheduledCount: number;
  onScheduled: (
    assigned: Array<{ postId: string; scheduledOn: string }>,
    time: string,
  ) => void;
  onCleared: () => void;
}) {
  const [startOn, setStartOn] = useState(() => today());
  const [cadence, setCadence] = useState<CadenceId>("daily");
  const [time, setTime] = useState(DEFAULT_TIME);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [pending, setPending] = useState(false);

  const everyDays =
    CADENCE_OPTIONS.find((option) => option.id === cadence)?.everyDays ?? 1;

  const preview = useMemo(() => {
    if (!parseDay(startOn)) return [];
    return distributeSchedule(postCount, { startOn, everyDays, skipWeekends });
  }, [startOn, postCount, everyDays, skipWeekends]);

  async function handleSchedule() {
    if (!parseDay(startOn)) {
      toast.error("Elegí una fecha de inicio válida.");
      return;
    }

    // try/finally on every one of these: a server action can throw, and the
    // reset written inline after the await would be skipped, leaving the button
    // disabled and spinning with no way back.
    setPending(true);
    try {
      const result = await scheduleBatch(batchId, {
        startOn,
        everyDays,
        skipWeekends,
        time: time || DEFAULT_TIME,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onScheduled(result.assigned, time || DEFAULT_TIME);
      toast.success(
        `${result.assigned.length} pieza${result.assigned.length === 1 ? "" : "s"} en el calendario.`,
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo programar el lote.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleClear() {
    setPending(true);
    try {
      const result = await clearBatchSchedule(batchId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCleared();
      toast.success("Se quitaron las fechas. El contenido queda igual.");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No se pudieron quitar las fechas.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Programar el lote</h2>
        <span className="text-xs text-muted-foreground">
          {scheduledCount === 0
            ? `${postCount} pieza${postCount === 1 ? "" : "s"} sin fecha`
            : `${scheduledCount} de ${postCount} con fecha`}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="schedule-start" className="text-xs">
            Desde
          </Label>
          <Input
            id="schedule-start"
            type="date"
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
            className="h-9 w-auto"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule-time" className="text-xs">
            Hora
            <HelpTip label="Sobre la hora">
              Es hora de Buenos Aires, siempre — se guarda como hora de reloj, no
              como un instante, así que no se mueve si abrís la app desde otro
              huso.
            </HelpTip>
          </Label>
          <Input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="h-9 w-auto tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium">Frecuencia</span>
          <div className="flex flex-wrap gap-1.5">
            {CADENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={cadence === option.id}
                onClick={() => setCadence(option.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  cadence === option.id
                    ? "border-[color-mix(in_oklch,var(--synera-accent)_40%,transparent)] bg-accent/50 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label
          className="flex items-center gap-2 pb-2 text-sm"
          htmlFor="schedule-skip-weekends"
        >
          <input
            id="schedule-skip-weekends"
            type="checkbox"
            className="size-4 accent-[var(--synera-accent)]"
            checked={skipWeekends}
            onChange={(event) => setSkipWeekends(event.target.checked)}
          />
          Saltear fines de semana
        </label>
      </div>

      {preview.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Queda:{" "}
          <span className="text-foreground">
            {preview
              .slice(0, PREVIEW_DATES_SHOWN)
              .map((day) => formatDay(day))
              .join(" · ")}
            {preview.length > PREVIEW_DATES_SHOWN
              ? ` y ${preview.length - PREVIEW_DATES_SHOWN} más`
              : ""}
          </span>{" "}
          a las {time || DEFAULT_TIME}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={handleSchedule} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarRange className="size-4" />
          )}
          {scheduledCount > 0 ? "Reprogramar todo" : "Programar"}
        </Button>

        {scheduledCount > 0 ? (
          <Button variant="ghost" onClick={handleClear} disabled={pending}>
            <X className="size-4" />
            Quitar fechas
          </Button>
        ) : null}
      </div>
    </section>
  );
}
