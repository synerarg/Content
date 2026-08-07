/**
 * Calendar arithmetic — the part that breaks silently.
 *
 * Every assertion is written against a KNOWN calendar, and there are TWO
 * separate defences against the runtime's own clock leaking in. They catch
 * different bugs and neither is sufficient alone:
 *
 *   1. THE SECOND PASS, under TZ=UTC. The suite re-runs itself in a child
 *      process pinned to UTC — Vercel's zone, and the zone this project's one
 *      real date bug showed up in. This is what catches local-time
 *      CONSTRUCTION: `new Date(2026, 7, 5)` is midnight wherever the runtime
 *      is, so formatting it in Buenos Aires yields the 4th on a UTC server and
 *      the 5th on the developer's machine. That was `formatDay` until this
 *      change, and every day label on /configuracion was one early in
 *      production.
 *
 *   2. THE POISONED GETTERS, in the last section. Local-time READS —
 *      `getDate()`, `getDay()`, `getTimezoneOffset()` — throw, so any function
 *      reaching for the runtime's clock blows up instead of returning a value
 *      that is right here and wrong there. Verified to be a real test rather
 *      than a decorative one: `weekdayIndex` written with `getDay()` fails it.
 *      Note what it does NOT catch — `new Date(y, m, d)` calls no prototype
 *      getter, which is exactly why defence 1 exists.
 *
 * Re-running under a spread of named zones would be the obvious third defence
 * and is not available: Node on Windows honours `TZ=UTC` and silently ignores
 * named IANA zones (verified — `TZ=Asia/Tokyo` still resolves to the machine's
 * own zone), so it would have tested two zones while claiming five.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-schedule.ts
 */
import { spawnSync } from "node:child_process";
import {
  addDays,
  distributeSchedule,
  exportPrefix,
  firstOfMonth,
  formatScheduleLabel,
  formatTime,
  isWeekend,
  monthGrid,
  monthLabel,
  monthOf,
  parseDay,
  shiftMonth,
  today,
  weekdayIndex,
} from "../lib/schedule";
import { formatDay } from "../lib/format";

let failures = 0;
let checks = 0;

function assert(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? ` — got ${detail}` : ""}`);
}

function equal(label: string, actual: unknown, expected: unknown) {
  assert(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  console.log(`Runtime TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  // -------------------------------------------------------------------------
  section("Calendar dates never move");

  // The regression that started this. Midnight in a UTC runtime formatted in
  // Buenos Aires is 21:00 the previous day; the label must be the 5th anyway.
  assert(
    "formatDay('2026-08-05') names the 5th, whatever the runtime zone",
    formatDay("2026-08-05").includes("05"),
    formatDay("2026-08-05"),
  );
  assert(
    "formatDay('2026-01-01') names the 1st of January",
    formatDay("2026-01-01").includes("01") && /ene/i.test(formatDay("2026-01-01")),
    formatDay("2026-01-01"),
  );
  assert(
    "monthLabel does not slip to the previous month",
    /agosto/i.test(monthLabel({ year: 2026, month: 8 })),
    monthLabel({ year: 2026, month: 8 }),
  );

  // -------------------------------------------------------------------------
  section("Day arithmetic");

  equal("addDays across a month boundary", addDays("2026-08-31", 1), "2026-09-01");
  equal("addDays across a year boundary", addDays("2026-12-31", 1), "2027-01-01");
  equal("addDays backwards", addDays("2026-01-01", -1), "2025-12-31");
  equal("February in a common year", addDays("2026-02-28", 1), "2026-03-01");
  equal("February in a leap year", addDays("2028-02-28", 1), "2028-02-29");
  // Southern-hemisphere DST changes land in October. UTC-only math must ignore
  // them completely; a local-time implementation would return the same day twice.
  equal("across a DST transition", addDays("2026-10-17", 1), "2026-10-18");

  equal("2026-08-03 is a Monday (index 0)", weekdayIndex("2026-08-03"), 0);
  equal("2026-08-09 is a Sunday (index 6)", weekdayIndex("2026-08-09"), 6);
  assert("Saturday counts as weekend", isWeekend("2026-08-08"));
  assert("Sunday counts as weekend", isWeekend("2026-08-09"));
  assert("Friday does not", !isWeekend("2026-08-07"));

  equal("shiftMonth over December", shiftMonth({ year: 2026, month: 12 }, 1), {
    year: 2027,
    month: 1,
  });
  equal("shiftMonth before January", shiftMonth({ year: 2026, month: 1 }, -1), {
    year: 2025,
    month: 12,
  });
  equal("shiftMonth by a year", shiftMonth({ year: 2026, month: 5 }, 12), {
    year: 2027,
    month: 5,
  });
  equal("monthOf reads the month back", monthOf("2026-08-05"), {
    year: 2026,
    month: 8,
  });
  equal("firstOfMonth", firstOfMonth({ year: 2026, month: 8 }), "2026-08-01");

  // -------------------------------------------------------------------------
  section("Month grid");

  const grid = monthGrid({ year: 2026, month: 8 });
  equal("always six rows", grid.length, 6);
  assert("seven days each", grid.every((week) => week.length === 7));

  // 2026-08-01 is a Saturday, so the grid opens on Monday 27 July.
  equal("starts on the Monday before the 1st", grid[0][0].day, "2026-07-27");
  equal("ends on the Sunday after the month", grid[5][6].day, "2026-09-06");
  assert("leading days are marked out-of-month", grid[0][0].inMonth === false);
  assert("the 1st is in-month", grid[0][5].inMonth === true && grid[0][5].day === "2026-08-01");

  const days = grid.flat();
  equal("42 cells", days.length, 42);
  assert(
    "cells are consecutive with no gaps or repeats",
    days.every((cell, index) => index === 0 || cell.day === addDays(days[index - 1].day, 1)),
  );
  equal(
    "every day of August appears exactly once",
    days.filter((cell) => cell.inMonth).length,
    31,
  );

  // A month starting on a Sunday is the case that needs the sixth row.
  const march = monthGrid({ year: 2026, month: 3 });
  equal("March 2026 opens on 2026-02-23", march[0][0].day, "2026-02-23");
  assert(
    "March 2026 still fits in six rows",
    march.flat().filter((cell) => cell.inMonth).length === 31,
  );

  // -------------------------------------------------------------------------
  section("Distribution");

  equal(
    "one a day from a Monday",
    distributeSchedule(3, {
      startOn: "2026-08-03",
      everyDays: 1,
      skipWeekends: false,
    }),
    ["2026-08-03", "2026-08-04", "2026-08-05"],
  );

  equal(
    "weekends are skipped, not dropped",
    distributeSchedule(3, {
      startOn: "2026-08-07",
      everyDays: 1,
      skipWeekends: true,
    }),
    // Friday, then Monday and Tuesday — three pieces, none lost.
    ["2026-08-07", "2026-08-10", "2026-08-11"],
  );

  equal(
    "weekends are honoured when asked for",
    distributeSchedule(3, {
      startOn: "2026-08-07",
      everyDays: 1,
      skipWeekends: false,
    }),
    ["2026-08-07", "2026-08-08", "2026-08-09"],
  );

  equal(
    "a weekly cadence from a Friday stays on Fridays",
    distributeSchedule(3, {
      startOn: "2026-08-07",
      everyDays: 7,
      skipWeekends: true,
    }),
    ["2026-08-07", "2026-08-14", "2026-08-21"],
  );

  equal(
    "spacing is measured from where a piece LANDED, not from where it was due",
    // Due Saturday, lands Monday; the next is measured from Monday.
    distributeSchedule(2, {
      startOn: "2026-08-08",
      everyDays: 2,
      skipWeekends: true,
    }),
    ["2026-08-10", "2026-08-12"],
  );

  equal("count is always honoured", distributeSchedule(5, {
    startOn: "2026-08-03",
    everyDays: 1,
    skipWeekends: true,
  }).length, 5);
  equal("zero pieces produce no days", distributeSchedule(0, {
    startOn: "2026-08-03",
    everyDays: 1,
    skipWeekends: false,
  }), []);

  // -------------------------------------------------------------------------
  section("Display and export");

  equal("time loses its seconds", formatTime("10:00:00"), "10:00");
  equal("a null time is null", formatTime(null), null);
  assert(
    "a schedule label carries day and hour",
    (formatScheduleLabel("2026-08-05", "10:00:00") ?? "").includes("10:00"),
    String(formatScheduleLabel("2026-08-05", "10:00:00")),
  );
  equal("no day means no label", formatScheduleLabel(null, "10:00:00"), null);
  assert(
    "a day with no hour still labels",
    (formatScheduleLabel("2026-08-05", null) ?? "").includes("05"),
    String(formatScheduleLabel("2026-08-05", null)),
  );

  equal("export prefix is the day", exportPrefix("2026-08-05"), "2026-08-05");
  equal("no date exports as sin-fecha", exportPrefix(null), "sin-fecha");
  equal("garbage exports as sin-fecha", exportPrefix("mañana"), "sin-fecha");
  assert(
    "sin-fecha sorts after every real date, so unscheduled pieces group last",
    ["sin-fecha", "2026-08-05", "1999-01-01"].sort()[2] === "sin-fecha",
  );

  // -------------------------------------------------------------------------
  section("Today");

  const now = today();
  assert("today() is a well-formed day", parseDay(now) !== null, now);
  assert(
    "today() is the Buenos Aires date, not the runtime's",
    now ===
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    now,
  );

  // -------------------------------------------------------------------------
  section("Local time is never read");

  /*
    Replace every local-time accessor with a throw, then run the arithmetic
    again. Anything that reaches for the runtime's own clock — `getDate()`,
    `getDay()`, `getTimezoneOffset()` — blows up instead of quietly returning a
    value that would be right on this machine and wrong on Vercel.

    Results are collected and only printed after the originals are restored:
    console output itself is allowed to want a timestamp.
  */
  const LOCAL_ACCESSORS = [
    "getFullYear",
    "getMonth",
    "getDate",
    "getDay",
    "getHours",
    "getMinutes",
    "getTimezoneOffset",
  ] as const;

  const prototype = Date.prototype as unknown as Record<string, unknown>;
  const originals = new Map<string, unknown>();
  for (const name of LOCAL_ACCESSORS) originals.set(name, prototype[name]);

  const results: Array<[string, boolean, string]> = [];

  try {
    for (const name of LOCAL_ACCESSORS) {
      prototype[name] = () => {
        throw new Error(`local-time Date.prototype.${name}() was called`);
      };
    }

    const attempt = (label: string, run: () => unknown, expected: unknown) => {
      try {
        const actual = run();
        results.push([
          label,
          JSON.stringify(actual) === JSON.stringify(expected),
          JSON.stringify(actual),
        ]);
      } catch (cause) {
        results.push([label, false, cause instanceof Error ? cause.message : "threw"]);
      }
    };

    attempt("addDays", () => addDays("2026-08-31", 1), "2026-09-01");
    attempt("weekdayIndex", () => weekdayIndex("2026-08-03"), 0);
    attempt("isWeekend", () => isWeekend("2026-08-09"), true);
    attempt("firstOfMonth", () => firstOfMonth({ year: 2026, month: 8 }), "2026-08-01");
    attempt("monthGrid opens on the right day", () => monthGrid({ year: 2026, month: 8 })[0][0].day, "2026-07-27");
    attempt("monthGrid closes on the right day", () => monthGrid({ year: 2026, month: 8 })[5][6].day, "2026-09-06");
    attempt(
      "distributeSchedule",
      () =>
        distributeSchedule(3, {
          startOn: "2026-08-07",
          everyDays: 1,
          skipWeekends: true,
        }),
      ["2026-08-07", "2026-08-10", "2026-08-11"],
    );
    attempt("formatDay", () => formatDay("2026-08-05").includes("05"), true);
    attempt("monthLabel", () => /agosto/i.test(monthLabel({ year: 2026, month: 8 })), true);
    attempt("exportPrefix", () => exportPrefix("2026-08-05"), "2026-08-05");
    // `today()` legitimately asks what time it is — but it must ask Intl with
    // the agency zone named, never the runtime's own clock.
    attempt("today() still works with local time poisoned", () => parseDay(today()) !== null, true);
  } finally {
    for (const name of LOCAL_ACCESSORS) prototype[name] = originals.get(name);
  }

  for (const [label, ok, detail] of results) {
    assert(`${label} needs no local clock`, ok, ok ? "" : detail);
  }

  // -------------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} schedule assertions pass under ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  /*
    Second pass, pinned to UTC — the zone Vercel runs in and the one the day
    labels were wrong in. Spawned rather than set inline so the command works
    the same from PowerShell, cmd and a POSIX shell; the marker stops the child
    spawning a grandchild.
  */
  if (process.env.SCHEDULE_PROBE_UTC_PASS === "1") return;

  console.log("\n--- re-running pinned to TZ=UTC ---\n");
  // execArgv, not just argv: tsx installs itself through `--require` and
  // `--import`, which live there. Dropping them spawns a plain node that cannot
  // read a .ts file and exits with no output at all — which looks exactly like
  // a failing assertion.
  const child = spawnSync(
    process.argv[0],
    [...process.execArgv, ...process.argv.slice(1)],
    {
      env: { ...process.env, TZ: "UTC", SCHEDULE_PROBE_UTC_PASS: "1" },
      encoding: "utf8",
    },
  );

  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  const passedUnderUtc = child.status === 0 && /assertions pass under UTC/.test(output);

  if (!passedUnderUtc) {
    console.log(output.split("\n").filter((line) => /FAIL|Runtime TZ/.test(line)).join("\n"));
    console.log(
      "\nFAILED under UTC. Something here reads the runtime's own clock, and it",
      "\nwould be wrong in production while looking correct on this machine.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`All ${checks} assertions pass under UTC as well.`);
}

void main();
