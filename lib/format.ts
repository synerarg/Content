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

/*
  Pinned to UTC, unlike every other formatter in this file, and that is the
  point: this one renders a CALENDAR DATE, not an instant.

  It used to carry `timeZone: TIME_ZONE` and was off by one on the server. The
  input is a plain `YYYY-MM-DD`; building a Date from it produces midnight in
  whatever zone the runtime is in, and Vercel runs in UTC — so midnight UTC
  formatted in Buenos Aires (UTC-3) is 21:00 the PREVIOUS day. Every day label
  on /configuracion rendered one day early on the server and then a different
  day after hydration in the browser, which is a wrong number and a hydration
  mismatch at the same time.

  Building at UTC midnight and formatting in UTC makes both sides agree and
  keeps the value what it actually is: a date with no time and no zone.
*/
const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
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
 * Parsed as a plain calendar date, never as an instant. The value already had
 * the timezone work done to it — by the view that bucketed the day, or by the
 * agency that chose it — so any re-interpretation here can only move it. See
 * the note on `dayFormatter` for the off-by-one this used to have.
 */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return dayFormatter.format(new Date(Date.UTC(year, month - 1, date)));
}

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/**
 * "hace 2 horas" for anything recent, an absolute date beyond a week.
 *
 * Relative reads faster while it is still relative — "hace 2 horas" answers the
 * question, "06 ago 14:32" makes you do arithmetic. Past a week it inverts:
 * "hace 3 semanas" is vaguer than the date itself, so it switches back.
 *
 * Resolved against `Date.now()` at call time, so where it runs matters:
 *
 *   - Client components: fine, re-renders keep it current.
 *   - DYNAMIC server components: fine. "Now" is request time, and the value is
 *     never re-rendered on the client, so there is nothing to mismatch. Every
 *     page under `(app)` is `force-dynamic`, which is what makes the usage in
 *     the config page safe.
 *   - STATICALLY rendered components: not safe. "Now" would be build time and
 *     the string would age silently. Use `formatDateTime` there instead.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 45) return "recién";
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return relativeFormatter.format(Math.round(seconds / 86_400), "day");

  return dateTimeFormatter.format(date);
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
