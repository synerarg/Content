"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import { setPostSchedule } from "@/app/(app)/contenido/actions";
import {
  DEFAULT_TIME,
  formatTime,
  monthLabel,
  parseDay,
  shiftMonth,
  WEEKDAY_LABELS,
  type IsoDay,
  type Month,
  type MonthCell,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ScheduledPiece = {
  id: string;
  type: string;
  caption: string;
  scheduledOn: string | null;
  scheduledTime: string | null;
  batchId: string;
  batchTitle: string;
  brandId: string;
  brandName: string;
  brandAccent: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  feed: "Feed",
  story: "Historia",
  carousel: "Carrusel",
};

const ALL_BRANDS = "todas";

/** The chip has room for a few words, and the caption's first line is the piece. */
function pieceLabel(piece: ScheduledPiece): string {
  const first = piece.caption.split("\n").find((line) => line.trim());
  const text = (first ?? "").trim();
  if (!text) return TYPE_LABEL[piece.type] ?? piece.type;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function monthHref({ year, month }: Month): string {
  return `/calendario?mes=${year}-${String(month).padStart(2, "0")}`;
}

function PieceChip({
  piece,
  compact = false,
}: {
  piece: ScheduledPiece;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/contenido/${piece.batchId}`}
      title={`${piece.brandName} · ${TYPE_LABEL[piece.type] ?? piece.type} · ${piece.batchTitle}`}
      className="group block rounded-md border border-border bg-card/60 px-1.5 py-1 transition-colors hover:border-[color-mix(in_oklch,var(--synera-accent)_40%,transparent)] hover:bg-accent/30"
    >
      <span className="flex items-center gap-1.5">
        {/* A 3px marker, never a filled block: the palette is the client's, and
            a calendar tinted in six brand colours is unreadable. */}
        <span
          aria-hidden
          className="h-3 w-[3px] shrink-0 rounded-full"
          style={{ background: piece.brandAccent ?? "var(--synera-accent)" }}
        />
        <span className="truncate text-[11px] font-medium text-foreground">
          {piece.brandName}
        </span>
        {piece.scheduledTime ? (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatTime(piece.scheduledTime)}
          </span>
        ) : null}
      </span>
      {compact ? null : (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {pieceLabel(piece)}
        </span>
      )}
    </Link>
  );
}

/** One unscheduled piece, with the two inputs that put it on the calendar. */
function PendingRow({
  piece,
  defaultDay,
  onScheduled,
}: {
  piece: ScheduledPiece;
  defaultDay: IsoDay;
  onScheduled: () => void;
}) {
  const [day, setDay] = useState<string>(defaultDay);
  const [time, setTime] = useState<string>(DEFAULT_TIME);
  const [saving, setSaving] = useState(false);

  async function handleAssign() {
    if (!parseDay(day)) {
      toast.error("Elegí una fecha válida.");
      return;
    }

    setSaving(true);
    const result = await setPostSchedule(piece.id, {
      scheduled_on: day,
      scheduled_time: time || null,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Pieza programada.");
    onScheduled();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3">
      <span
        aria-hidden
        className="h-6 w-[3px] shrink-0 rounded-full"
        style={{ background: piece.brandAccent ?? "var(--synera-accent)" }}
      />
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm">{pieceLabel(piece)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {piece.brandName} · {TYPE_LABEL[piece.type] ?? piece.type} ·{" "}
          <Link
            href={`/contenido/${piece.batchId}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {piece.batchTitle}
          </Link>
        </p>
      </div>

      <input
        type="date"
        aria-label={`Fecha para ${pieceLabel(piece)}`}
        value={day}
        onChange={(event) => setDay(event.target.value)}
        className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
      />
      <input
        type="time"
        aria-label={`Hora para ${pieceLabel(piece)}`}
        value={time}
        onChange={(event) => setTime(event.target.value)}
        className="h-9 rounded-md border border-border bg-transparent px-2 text-sm tabular-nums"
      />
      <Button variant="secondary" size="sm" onClick={handleAssign} disabled={saving}>
        <CalendarPlus className="size-4" />
        {saving ? "Guardando…" : "Programar"}
      </Button>
    </div>
  );
}

export function CalendarBoard({
  month,
  todayDay,
  weeks,
  pieces,
  unscheduled,
  unscheduledLimit,
  defaultDay,
}: {
  month: Month;
  todayDay: IsoDay;
  weeks: MonthCell[][];
  pieces: ScheduledPiece[];
  unscheduled: ScheduledPiece[];
  unscheduledLimit: number;
  defaultDay: IsoDay;
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(ALL_BRANDS);

  /*
    The brand filter is client-side on purpose.

    The month is a URL parameter because changing it needs a different query;
    the brand is not, because the month's pieces are already here. Making it a
    parameter too would mean a server round trip to hide half a dozen chips.
  */
  const brands = useMemo(() => {
    const byId = new Map<string, string>();
    for (const piece of [...pieces, ...unscheduled]) {
      if (piece.brandId) byId.set(piece.brandId, piece.brandName);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pieces, unscheduled]);

  const visible = useMemo(
    () => (brandId === ALL_BRANDS ? pieces : pieces.filter((p) => p.brandId === brandId)),
    [pieces, brandId],
  );

  const visiblePending = useMemo(
    () =>
      brandId === ALL_BRANDS
        ? unscheduled
        : unscheduled.filter((p) => p.brandId === brandId),
    [unscheduled, brandId],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPiece[]>();
    for (const piece of visible) {
      if (!piece.scheduledOn) continue;
      const list = map.get(piece.scheduledOn);
      if (list) list.push(piece);
      else map.set(piece.scheduledOn, [piece]);
    }
    return map;
  }, [visible]);

  return (
    <div className="space-y-6 px-6 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Mes anterior">
            <Link href={monthHref(shiftMonth(month, -1))}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Mes siguiente">
            <Link href={monthHref(shiftMonth(month, 1))}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <h2 className="ml-2 text-sm font-semibold capitalize">
            {monthLabel(month)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {brands.length > 1 ? (
            <>
              <Label htmlFor="calendar-brand" className="text-xs text-muted-foreground">
                Marca
              </Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="calendar-brand" className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANDS}>Todas las marcas</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------------------------- */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-card/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[11px] uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {weeks.flat().map((cell) => {
            const dayPieces = byDay.get(cell.day) ?? [];
            const isToday = cell.day === todayDay;
            const dayNumber = parseDay(cell.day)?.date ?? "";

            return (
              <div
                key={cell.day}
                className={cn(
                  "min-h-24 space-y-1 border-b border-r border-border p-1.5 last:border-r-0",
                  !cell.inMonth && "bg-card/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      isToday
                        ? "rounded-full bg-[var(--synera-accent)] px-1.5 font-semibold text-[var(--synera-on-accent,#0b0d10)]"
                        : cell.inMonth
                          ? "text-muted-foreground"
                          : "text-muted-foreground/40",
                    )}
                  >
                    {dayNumber}
                  </span>
                </div>

                {dayPieces.map((piece) => (
                  <PieceChip key={piece.id} piece={piece} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-[var(--synera-accent)]" />
          <h2 className="text-sm font-semibold">
            Sin programar ({visiblePending.length})
          </h2>
        </div>

        {visiblePending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Todas las piezas tienen fecha.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {visiblePending.map((piece) => (
                <PendingRow
                  key={piece.id}
                  piece={piece}
                  defaultDay={defaultDay}
                  onScheduled={() => router.refresh()}
                />
              ))}
            </div>

            {/*
              Said out loud rather than silently truncated: a list capped at 40
              that looks complete is how a piece gets forgotten.
            */}
            {unscheduled.length >= unscheduledLimit ? (
              <p className="text-xs text-muted-foreground">
                Se muestran las {unscheduledLimit} piezas sin programar más
                recientes. Puede haber más en lotes viejos.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
