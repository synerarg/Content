import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/app-shell/empty-state";
import { CalendarBoard, type ScheduledPiece } from "@/components/schedule/calendar-board";
import { Button } from "@/components/ui/button";
import {
  firstOfMonth,
  monthGrid,
  monthOf,
  today,
  type Month,
} from "@/lib/schedule";

export const metadata: Metadata = {
  title: "Calendario",
  description: "Cuándo sale cada pieza, sobre todos los lotes y todas las marcas.",
};

/** How many unscheduled pieces to offer at once before it stops being a list. */
const UNSCHEDULED_LIMIT = 40;

function requestedMonth(value: string | undefined): Month {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return monthOf(today());

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return monthOf(today());
  }
  return { year, month };
}

type PostRow = {
  id: string;
  type: string;
  caption: string;
  scheduled_on: string | null;
  scheduled_time: string | null;
  content_batches: {
    id: string;
    title: string;
    brands: { id: string; name: string; palette: unknown } | null;
  } | null;
};

function toPiece(row: PostRow): ScheduledPiece | null {
  const batch = row.content_batches;
  if (!batch) return null;

  const palette = batch.brands?.palette;
  const accent =
    typeof palette === "object" && palette !== null && !Array.isArray(palette)
      ? ((palette as Record<string, unknown>).primary as string | undefined)
      : undefined;

  return {
    id: row.id,
    type: row.type,
    caption: row.caption,
    scheduledOn: row.scheduled_on,
    scheduledTime: row.scheduled_time,
    batchId: batch.id,
    batchTitle: batch.title,
    brandId: batch.brands?.id ?? "",
    brandName: batch.brands?.name ?? "Sin marca",
    // Only used as a 3px marker, never as a fill: several clients on one
    // calendar are otherwise indistinguishable at a glance.
    brandAccent: typeof accent === "string" ? accent : null,
  };
}

/*
  Both queries join `content_batches` with `!inner` and filter its `deleted_at`.

  A soft-deleted batch is invisible everywhere else (every read of that table
  filters it), and a calendar that kept showing its pieces would be the one
  screen where deleting something appears not to work. The filter belongs on the
  embedded resource, not applied afterwards in JS, so the row never arrives.
*/
const SELECT =
  "id, type, caption, scheduled_on, scheduled_time, content_batches!inner(id, title, deleted_at, brands(id, name, palette))";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const month = requestedMonth(mes);
  const todayDay = today();

  /*
    What the date inputs in the unscheduled list start on.

    Today while you are looking at this month, the 1st once you have paged
    away — offering "today" as the default on a calendar showing next March is
    an invitation to schedule something into the past by accident.
  */
  const current = monthOf(todayDay);
  const defaultDay =
    month.year === current.year && month.month === current.month
      ? todayDay
      : firstOfMonth(month);

  // The grid shows leading and trailing days from the neighbouring months, and
  // a piece sitting on one of them must appear. Querying the MONTH rather than
  // the visible range would leave those cells wrongly empty.
  const grid = monthGrid(month);
  const rangeStart = grid[0][0].day;
  const rangeEnd = grid[grid.length - 1][6].day;

  const supabase = await createClient();

  const [{ data: scheduled }, { data: unscheduled }] = await Promise.all([
    supabase
      .from("posts")
      .select(SELECT)
      .is("content_batches.deleted_at", null)
      .not("scheduled_on", "is", null)
      .gte("scheduled_on", rangeStart)
      .lte("scheduled_on", rangeEnd)
      .order("scheduled_on", { ascending: true })
      .order("scheduled_time", { ascending: true, nullsFirst: true }),
    supabase
      .from("posts")
      .select(SELECT)
      .is("content_batches.deleted_at", null)
      .is("scheduled_on", null)
      .order("created_at", { ascending: false })
      .limit(UNSCHEDULED_LIMIT),
  ]);

  const pieces = ((scheduled ?? []) as PostRow[])
    .map(toPiece)
    .filter((piece): piece is ScheduledPiece => piece !== null);

  const pending = ((unscheduled ?? []) as PostRow[])
    .map(toPiece)
    .filter((piece): piece is ScheduledPiece => piece !== null);

  if (pieces.length === 0 && pending.length === 0) {
    return (
      <>
        <PageHeader
          title="Calendario"
          description="Cuándo sale cada pieza, sobre todos los lotes y todas las marcas."
        />
        <EmptyState
          icon={Palette}
          title="Todavía no hay piezas para programar"
          description="Generá un lote y vas a poder repartirlo en el calendario de una sola vez, desde la pantalla del lote."
          action={
            <Button asChild>
              <Link href="/contenido">Ir a contenido</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Cuándo sale cada pieza, sobre todos los lotes y todas las marcas."
        action={
          <Button asChild variant="outline">
            <Link href="/contenido">
              <CalendarDays className="size-4" />
              Lotes
            </Link>
          </Button>
        }
      />
      <CalendarBoard
        month={month}
        // Resolved on the server, where "now" is request time in the agency's
        // timezone — a browser in another zone would otherwise light up the
        // wrong cell as today.
        todayDay={todayDay}
        weeks={grid}
        pieces={pieces}
        unscheduled={pending}
        unscheduledLimit={UNSCHEDULED_LIMIT}
        defaultDay={defaultDay}
      />
    </>
  );
}
