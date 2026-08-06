/*
  Display formatting for the cost panel.

  Everything here pins an explicit timeZone and locale rather than taking the
  runtime's. On Vercel the server runs in UTC while the agency reads this from
  Buenos Aires, so an unpinned formatter would render one time on the server and
  another after hydration — a hydration mismatch AND a wrong number. The zone
  matches the one `generation_usage_daily` buckets days by, so a row's day label
  and its timestamp can never disagree.
*/

export const TIME_ZONE = "America/Argentina/Buenos_Aires";
const LOCALE = "es-AR";

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
});

const numberFormatter = new Intl.NumberFormat(LOCALE);

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/**
 * Format a `date` column coming back from Postgres as `YYYY-MM-DD`.
 *
 * Parsed as a plain calendar date, not an instant: `new Date("2026-08-05")` is
 * midnight UTC, which formats as the 4th in Buenos Aires. The view already did
 * the timezone work when it bucketed the day, so re-interpreting the result as
 * an instant would shift every label back by one.
 */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return dayFormatter.format(new Date(year, month - 1, date));
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatCount(value: number | null | undefined): string {
  return numberFormatter.format(value ?? 0);
}

/** Token counts run to six figures; k-notation keeps the columns narrow. */
export function formatTokens(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n === 0) return "—";
  if (n < 10_000) return numberFormatter.format(n);
  return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k`;
}
