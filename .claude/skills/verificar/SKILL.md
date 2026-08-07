---
name: verificar
description: Write a verification script for Synera Content Studio — a `verify:*` suite of offline assertions, or a `probe:*` live run against a real provider. Use when a feature needs proving, when a bug needs a regression test, or when asked to verify, probe or test anything in this project.
---

# Verifying work in this project

This repo's central discipline: **nothing is claimed to work until something ran
and said so.** HANDOFF.md §"Verification status" is a table of what was proven
and how, and every row points at a script in `scripts/`. A feature without a row
is a feature nobody has checked.

There are exactly two kinds of script and they answer different questions.

## Choosing the kind

| | `verify:*` | `probe:*` |
|---|---|---|
| Answers | "Is this arithmetic right?" | "What does the real provider actually do?" |
| Cost | free, no network, no keys | real money, real latency, rate limits |
| Output | PASS/FAIL, `process.exitCode` | printed for a human to read, plus files to look at |
| Runs | every time, before every commit | once, deliberately, when the answer could change |

**Pick `verify` whenever the thing under test is deterministic** — colour maths,
date arithmetic, snippet offsets, RLS shape, error classification, schema
reflection. If it can be asserted, assert it.

**Pick `probe` when the answer lives in someone else's system** — does Gemini
accept this payload shape, does the prompt change actually alter the image, what
is the real similarity between two Spanish captions. These print for the eyes
and end with the questions the reader must answer.

Some features need both. Legibility got a `verify` for the maths; the image
prompt got a `probe` because only eyes settle it.

## Both kinds: the file shape

Live in `scripts/`, named `verify-<thing>.ts` or `probe-<thing>.ts`. Registered
in `package.json` under `verify:<thing>` / `probe:<thing>`.

Anything importing from `lib/**` needs the stub, because those modules start
with `import "server-only"`, which throws under plain Node:

```
tsx --require ./scripts/_stub-server-only.cjs scripts/verify-thing.ts
```

**The header comment says what could go wrong, not what the file does.** This is
the convention that makes the suite readable a year later. Compare:

- ✗ "Tests the address filter and the extraction helpers."
- ✓ "This is the only place in the project where the server opens a connection
  to an address someone else typed, so the address filter is tested against
  every bypass worth naming — decimal-dotted loopback, IPv4-mapped IPv6,
  link-local (which is where a cloud metadata endpoint lives)."

End the header with the `Run:` line.

## The `verify` shape

Copy the harness from `scripts/verify-website.ts`:

```ts
let failures = 0;
let checks = 0;

function assert(label: string, condition: boolean, detail = "") {
  checks++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${condition || !detail ? "" : ` — ${detail}`}`,
  );
  if (!condition) failures++;
}

function section(title: string) {
  console.log(`\n${title}`);
}
```

and close with:

```ts
console.log(
  failures === 0
    ? `\nAll ${checks} <thing> assertions pass.`
    : `\n${failures} of ${checks} FAILED — do not ship.`,
);
process.exitCode = failures === 0 ? 0 : 1;
```

Rules that came from real failures in this repo:

- **Pass `detail`** — the actual value — on any assertion whose failure would
  otherwise be unreadable. `hexes.join(" ")` turned "FAIL finds the brand green"
  into a diagnosis.
- **Assert both directions.** The address filter has a "what must be refused"
  section and a "what must still be allowed" section. A filter that rejects
  everything passes the first one.
- **Test the boundary, not the middle.** `172.15.0.1` and `172.32.0.1` sit one
  step outside the private range; those are the assertions that catch an
  off-by-one mask.
- **Assert the copy, not just the code path.** The 403 bug was a *lie*, not a
  crash: the class was wrong and the sentence blamed the wrong party. So
  `verify-website.ts` asserts that a site failure is not attributed to the AI
  provider and that every branch tells the reader something to do.
- **Prove the test is real.** When a check guards against a bug that already
  happened, reintroduce the bug once and confirm the check fails. Write down
  that you did — see the `formatDay` row in HANDOFF.
- **Defend against the runtime's clock.** Date logic gets two defences, because
  they catch different bugs: re-run the suite in a `spawnSync` child pinned to
  `TZ=UTC` (catches local-time *construction*), and poison
  `Date.prototype.getDate/getDay/getTimezoneOffset` (catches local-time
  *reads*). `scripts/verify-schedule.ts` has both. Note in passing: Node on
  Windows honours `TZ=UTC` and silently ignores named IANA zones, so never
  claim a script tested five zones when it tested two.
- When spawning a child, carry the loader:
  `[...process.execArgv, ...process.argv.slice(1)]`.

## The `probe` shape

Probes cost money, so they are written to waste as little as possible.

```ts
function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
```

- **Wait out rate limits instead of failing.** The free tier does ~2 images a
  minute; catch `RateLimitError`, log `429 — esperando Ns`, retry.
- **Reuse expensive fixtures.** `probe-scene-reference.ts` writes
  `probe-ref-0-product.jpg` and reuses it on later runs: comparing two prompt
  versions means holding everything else still, and a freshly generated bottle
  differs every time. Say in a comment how to force a new one.
- **Add a flag to re-run only the half that changed.** `probe:carousel --con`
  skips the baseline; each set is four paid images.
- **A/B or it proves nothing.** Generate the same brief with and without the
  change and write both out. A single image cannot answer "did this help".
- **End with the questions**, in order of importance, and be explicit about what
  a failure looks like:

```ts
console.log(
  "\nMirá los tres archivos. Lo que hay que responder, en orden de importancia:",
  "\n  1. ¿La escena CON referencia sigue VACÍA? Si aparece una botella, esto no se usa.",
  ...
);
```

- **Probe output stays out of git.** Generated `.jpg`/`.png` files are ignored.

## Registering and recording

1. Add the script to `package.json`.
2. Add a row to the verification table in HANDOFF.md. State the count
   (`77 asserts`), the verdict, and **what it actually showed** — including
   partial results. `PARTIAL, and recorded as such — WIDE and CLOSE DETAIL gave
   genuinely different frames; OPPOSITE SIDE came back close to the wide shot`
   is a better row than a green tick.
3. If the script is a `verify`, add it to the run list in HANDOFF §"Commands".

## The rule behind all of it

Report what happened. A probe that half-worked is written down as half-working,
with the failing half named and explained. Never write a row for a script you
did not run, and never round a partial pass up to a pass — the whole value of
this table is that it can be trusted.
