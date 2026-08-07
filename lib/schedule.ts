import { formatDay, TIME_ZONE } from "@/lib/format";

/*
  Calendar arithmetic for the publishing plan.

  Every function here works on `YYYY-MM-DD` strings and integers, and the only
  Date objects built are at UTC midnight, read back with `getUTC*`. That is not
  fussiness: a calendar is the one place where "what day is this" has to give the
  same answer on a Vercel function running in UTC, in a browser in Buenos Aires,
  and in a browser somewhere else. Any local-time Date in this file would make
  the month grid shift for some readers and not others.

  The single exception is `today()`, which genuinely needs to know when now is —
  and asks in the agency's timezone, explicitly.

  Deliberately free of `server-only`: the calendar page builds a grid on the
  server, the batch panel previews a distribution in the browser, and the
  distribution has to be identical in both.
*/

/** A calendar date with no time and no zone, as Postgres `date` returns it. */
export type IsoDay = string;

/** Postgres `time`, as it comes back: "10:00:00". Displayed as "10:00". */
export type IsoTime = string;

export const WEEKDAY_LABELS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const DAY_MS = 86_400_000;

export function parseDay(day: IsoDay): { year: number; month: number; date: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return { year, month, date };
}

export function toDay(year: number, month: number, date: number): IsoDay {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function toUtc(day: IsoDay): Date | null {
  const parsed = parseDay(day);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.date));
}

function fromUtc(date: Date): IsoDay {
  return toDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(day: IsoDay, amount: number): IsoDay {
  const utc = toUtc(day);
  if (!utc) return day;
  return fromUtc(new Date(utc.getTime() + amount * DAY_MS));
}

/** 0 = Monday … 6 = Sunday. The week starts on Monday here, as it does in Argentina. */
export function weekdayIndex(day: IsoDay): number {
  const utc = toUtc(day);
  if (!utc) return 0;
  return (utc.getUTCDay() + 6) % 7;
}

export function isWeekend(day: IsoDay): boolean {
  return weekdayIndex(day) >= 5;
}

/**
 * Today, in the agency's timezone.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, which is the shape everything else
 * here speaks. Asking the runtime for its own date instead would put a Vercel
 * function three hours ahead of the person reading the screen — enough to
 * highlight tomorrow as "hoy" for most of the evening.
 */
export function today(): IsoDay {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

export type MonthCell = { day: IsoDay; inMonth: boolean };

export type Month = { year: number; month: number };

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function monthOf(day: IsoDay): Month {
  const parsed = parseDay(day);
  return parsed
    ? { year: parsed.year, month: parsed.month }
    : { year: 1970, month: 1 };
}

export function firstOfMonth({ year, month }: Month): IsoDay {
  return toDay(year, month, 1);
}

/**
 * Six weeks of seven days, always — never five, never four.
 *
 * A grid that changes height as you page through months makes everything below
 * it jump, and a month that starts on a Sunday genuinely needs six rows. Fixing
 * the count costs a row of greyed-out days in some months and keeps the page
 * still.
 */
export function monthGrid(month: Month, weeks = 6): MonthCell[][] {
  const first = firstOfMonth(month);
  const start = addDays(first, -weekdayIndex(first));

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, week * 7 + index);
      const parsed = parseDay(day);
      return {
        day,
        inMonth: parsed?.year === month.year && parsed?.month === month.month,
      };
    }),
  );
}

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  // UTC, like `formatDay` and for the same reason: this labels a calendar
  // month, not a moment.
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function monthLabel({ year, month }: Month): string {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "10:00:00" -> "10:00". Postgres returns seconds; nobody schedules by them. */
export function formatTime(time: IsoTime | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? `${match[1]}:${match[2]}` : time;
}

/** What an `<input type="time">` needs, and what the column accepts back. */
export function timeInputValue(time: IsoTime | null | undefined): string {
  return formatTime(time) ?? "";
}

export const DEFAULT_TIME = "10:00";

/** "05 ago · 10:00", or just the day, or null when the piece has no date. */
export function formatScheduleLabel(
  day: IsoDay | null | undefined,
  time: IsoTime | null | undefined,
): string | null {
  if (!day) return null;
  const hour = formatTime(time);
  return hour ? `${formatDay(day)} · ${hour}` : formatDay(day);
}

/**
 * Folder prefix for the ZIP, so the archive sorts in publishing order.
 *
 * Unscheduled pieces get `sin-fecha`, which sorts after every date — they end
 * up grouped at the bottom rather than scattered through the plan.
 */
export function exportPrefix(day: IsoDay | null | undefined): string {
  return day && parseDay(day) ? day : "sin-fecha";
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

export type DistributionOptions = {
  startOn: IsoDay;
  /** Days between consecutive pieces. 1 = one a day, 7 = one a week. */
  everyDays: number;
  skipWeekends: boolean;
};

/**
 * Spread `count` pieces across the calendar from a start date.
 *
 * `skipWeekends` moves a piece forward to the next Monday rather than dropping
 * it, and the spacing is then measured from where it actually landed — so a
 * weekly cadence starting on a Friday does not silently become "every Monday
 * and Friday alternately".
 *
 * Returns exactly `count` days, in order. The caller assigns them to pieces in
 * publishing order.
 */
export function distributeSchedule(
  count: number,
  { startOn, everyDays, skipWeekends }: DistributionOptions,
): IsoDay[] {
  if (count <= 0) return [];
  const step = Math.max(1, Math.floor(everyDays));

  const days: IsoDay[] = [];
  let cursor = startOn;

  for (let index = 0; index < count; index++) {
    if (skipWeekends) {
      while (isWeekend(cursor)) cursor = addDays(cursor, 1);
    }
    days.push(cursor);
    cursor = addDays(cursor, step);
  }

  return days;
}

/** "Semana completa" and friends, as cadence choices rather than free numbers. */
export const CADENCE_OPTIONS = [
  { id: "daily", label: "Una por día", everyDays: 1 },
  { id: "every-2", label: "Día por medio", everyDays: 2 },
  { id: "every-3", label: "Cada 3 días", everyDays: 3 },
  { id: "weekly", label: "Una por semana", everyDays: 7 },
] as const;

export type CadenceId = (typeof CADENCE_OPTIONS)[number]["id"];
