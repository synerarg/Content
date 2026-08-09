/**
 * RLS smoke test.
 *
 * Hits every tenant-scoped table with nothing but the publishable key — i.e. as
 * an unauthenticated caller. Each one must return HTTP 200 with an empty array:
 *
 *   200 []        table exists, RLS denies the rows          PASS
 *   200 [ ... ]   RLS is off or a policy is too permissive   FAIL (leak)
 *   401 / 404     misconfigured key or missing table         FAIL (broken)
 *
 * A 200 with rows is the dangerous outcome, which is why this asserts on the
 * body rather than just the status code.
 *
 * Run: node scripts/verify-rls.mjs
 */
import { readFileSync } from "node:fs";

const TENANT_TABLES = [
  "workspaces",
  "workspace_members",
  "brands",
  "brand_fonts",
  "brand_products",
  "brand_published_posts",
  "generations",
  "content_batches",
  "posts",
  "slides",
  "slide_backgrounds",
  // A VIEW, and the reason it is in this list. Postgres views run as their
  // owner unless created `with (security_invoker = on)`; the owner here is
  // postgres, which bypasses RLS. Get that wrong and this view hands every
  // workspace's spend to any caller while the base table stays correctly
  // locked down — a leak no test on `generations` itself would ever catch.
  "generation_usage_daily",
];

function readEnvLocal() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = readEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

let failures = 0;

for (const table of TENANT_TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();

  let verdict;
  if (res.status !== 200) {
    verdict = "FAIL (unexpected status)";
    failures++;
  } else if (body.trim() !== "[]") {
    verdict = "FAIL (rows leaked to anonymous caller)";
    failures++;
  } else {
    verdict = "PASS";
  }

  console.log(`${table.padEnd(20)} ${String(res.status).padEnd(4)} ${body.slice(0, 60).padEnd(10)} ${verdict}`);
}

/*
  Storage, and it is a separate question from the tables.

  Bucket privacy and bucket POLICIES are two different settings, and getting the
  first right does nothing for the second. A bucket marked private still answers
  the public-object endpoint with 400/404 rather than serving bytes — that is
  the flag doing its job — but the authenticated `object` endpoint is governed
  entirely by the policies in migrations 0005 and 0017. `renders` is where
  composed client work now lives, so both are checked from an anonymous caller.

  What must NOT happen: 200 with image bytes.
*/
const PRIVATE_BUCKETS = ["generated", "renders"];
const PROBE_OBJECT = "00000000-0000-0000-0000-000000000000/probe.png";

for (const bucket of PRIVATE_BUCKETS) {
  for (const [label, path] of [
    ["public", `object/public/${bucket}/${PROBE_OBJECT}`],
    ["authenticated", `object/${bucket}/${PROBE_OBJECT}`],
  ]) {
    const res = await fetch(`${url}/storage/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const body = await res.text();

    // 400 and 404 are both correct here: Storage does not distinguish "denied"
    // from "absent" to an anonymous caller, which is the behaviour we want.
    const ok = res.status !== 200;
    if (!ok) failures++;

    console.log(
      `${`${bucket} (${label})`.padEnd(24)} ${String(res.status).padEnd(4)} ${body
        .slice(0, 40)
        .replace(/\s+/g, " ")
        .padEnd(42)} ${ok ? "PASS" : "FAIL (object served to anonymous caller)"}`,
    );
  }
}

const total = TENANT_TABLES.length + PRIVATE_BUCKETS.length * 2;

console.log(
  failures === 0
    ? `\nAll ${total} checks pass: ${TENANT_TABLES.length} tenant relations and ${PRIVATE_BUCKETS.length} private buckets deny anonymous reads.`
    : `\n${failures} FAILURE(S) — do not ship.`,
);
process.exit(failures === 0 ? 0 : 1);
