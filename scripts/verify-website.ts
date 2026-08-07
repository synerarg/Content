/**
 * Reading a client's website: the guards and the extraction.
 *
 * Two halves, and the first one is security rather than quality. This is the
 * only place in the project where the server opens a connection to an address
 * someone else typed, so the address filter is tested against every bypass
 * worth naming — decimal-dotted loopback, IPv4-mapped IPv6, link-local (which
 * is where a cloud metadata endpoint lives), and the ranges that look public
 * until you look them up.
 *
 * The second half holds down the extraction, which is deliberately code rather
 * than a model: counting CSS declarations is arithmetic, and arithmetic can be
 * asserted.
 *
 * No network, no API key, no cost.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-website.ts
 */
import { isPrivateAddress, normalizeSiteUrl } from "../lib/web/safe-fetch";
import {
  extractColors,
  extractFontFamilies,
  extractMeta,
  extractText,
  toPaletteTokens,
} from "../lib/web/extract-brand";

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

const PAGE = `<!doctype html>
<html lang="es">
<head>
  <title>Olivares del Sur | Aceite de oliva de Mendoza</title>
  <meta name="description" content="Aceite de oliva extra virgen, primera prensada en frío.">
  <meta property="og:site_name" content="Olivares del Sur">
  <style>
    :root { --marca: #4a5d23; --acento: #c9a227; }
    body { background: #12160f; color: #f4f1e8; font-family: "Fraunces", Georgia, serif; }
    .btn { background: #4a5d23; color: #ffffff; font-family: "Inter", Arial, sans-serif; }
    .btn:hover { background: #4b5e24; }
    .card { border-color: #4a5d23; background: rgb(18, 22, 15); }
    .tag { color: #c9a227; font-family: "Inter", sans-serif; }
    .hero { background: #4a5d23; }
    .footer { color: #000000; background: #ffffff; }
  </style>
  <script>window.dataLayer = [{ color: "#ff0000" }];</script>
</head>
<body>
  <nav><a href="/">Inicio</a> <a href="/tienda">Tienda</a></nav>
  <h1>El aceite que no se esconde</h1>
  <p>Cosechamos a mano en Maip&uacute;, Mendoza. Prensamos en fr&iacute;o el mismo d&iacute;a.</p>
  <p>Sin mezclas, sin apuro &amp; sin marketing de m&aacute;s.</p>
  <noscript>Activ&aacute; JavaScript</noscript>
</body>
</html>`;

async function main() {
  // -------------------------------------------------------------------------
  section("Address filter — what must be refused");

  const blocked = [
    ["127.0.0.1", "loopback"],
    ["127.1.1.1", "loopback, not just .0.1"],
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private, bottom of the range"],
    ["172.31.255.255", "private, top of the range"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "link-local — the cloud metadata endpoint"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["198.18.0.1", "benchmarking"],
    ["192.0.2.1", "documentation"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fd00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback — the bypass"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata endpoint"],
    ["no-es-una-ip", "not an address at all"],
  ] as const;

  for (const [address, why] of blocked) {
    assert(`refuses ${address} (${why})`, isPrivateAddress(address));
  }

  section("Address filter — what must still be allowed");

  const allowed = [
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["172.15.0.1", "just BELOW the private 172.16 range"],
    ["172.32.0.1", "just ABOVE the private 172.16 range"],
    ["100.63.255.255", "just below CGNAT"],
    ["100.128.0.1", "just above CGNAT"],
    ["11.0.0.1", "just above the private 10/8"],
    ["9.255.255.255", "just below the private 10/8"],
    ["169.253.0.1", "adjacent to link-local, not in it"],
    ["2606:4700:4700::1111", "public IPv6"],
  ] as const;

  for (const [address, why] of allowed) {
    assert(`allows ${address} (${why})`, !isPrivateAddress(address));
  }

  // -------------------------------------------------------------------------
  section("URL normalisation");

  assert(
    "a bare domain gets https",
    normalizeSiteUrl("olivaresdelsur.com.ar").toString().startsWith("https://"),
  );
  assert(
    "an explicit http is kept, not upgraded",
    normalizeSiteUrl("http://ejemplo.com").protocol === "http:",
  );

  for (const bad of ["file:///etc/passwd", "gopher://x", "javascript:alert(1)"]) {
    let refused = false;
    try {
      normalizeSiteUrl(bad);
    } catch {
      refused = true;
    }
    assert(`refuses ${bad}`, refused);
  }

  // "data:" is the interesting one: prefixing it with https:// would turn it
  // into a valid-looking URL, so it must be rejected on scheme, not repaired.
  let dataRefused = false;
  try {
    normalizeSiteUrl("data:text/html,<h1>x</h1>");
  } catch {
    dataRefused = true;
  }
  assert("refuses a data: URL rather than repairing it", dataRefused);

  // -------------------------------------------------------------------------
  section("Colour extraction");

  const colors = extractColors(PAGE);
  const hexes = colors.map((color) => color.hex);

  assert(
    "finds the brand green, which the CSS uses most",
    hexes[0] === "#4a5d23",
    hexes.join(" "),
  );
  assert("finds the accent gold", hexes.includes("#c9a227"));
  assert(
    "merges #4b5e24 into #4a5d23 rather than spending a slot on a hover shade",
    !hexes.includes("#4b5e24"),
    hexes.join(" "),
  );
  assert(
    "KEEPS white and black — they are usually the real bg and fg",
    hexes.includes("#ffffff") && hexes.includes("#000000"),
    hexes.join(" "),
  );
  assert(
    "reads rgb() as well as hex, and merges it with the same colour",
    hexes.includes("#12160f"),
    hexes.join(" "),
  );
  assert(
    "ignores colours inside <script>, which are data and not design",
    !hexes.includes("#ff0000"),
    hexes.join(" "),
  );

  // -------------------------------------------------------------------------
  section("Palette tokens");

  const palette = toPaletteTokens(colors);
  const byKey = Object.fromEntries(palette.map((token) => [token.key, token.value]));

  assert(
    "always produces the two tokens the render path requires",
    "bg" in byKey && "fg" in byKey,
    JSON.stringify(byKey),
  );
  // The MOST-USED dark, not the darkest: the fixture's inverted footer declares
  // pure black once, and letting that outlier win would hand the render path a
  // background the site barely uses.
  assert(
    "the most-used dark colour becomes the background, not the darkest",
    byKey.bg === "#12160f",
    byKey.bg,
  );
  assert("a light colour becomes the foreground", byKey.fg === "#ffffff", byKey.fg);
  assert(
    "the accent is the brand green, and it has real chroma",
    byKey.primary === "#4a5d23",
    byKey.primary,
  );
  assert(
    "on-primary is readable over that accent",
    byKey["on-primary"] === "#ffffff",
    byKey["on-primary"],
  );

  /*
    The regression a live run found: a site that declares a neutral grey more
    often than its brand colour must still get the brand colour as its accent.
    Supabase came back with #a0a0a0 as primary and its green as body text.
  */
  const greyHeavy = toPaletteTokens([
    { hex: "#a0a0a0", count: 31 },
    { hex: "#525252", count: 20 },
    { hex: "#1c1c1c", count: 18 },
    { hex: "#ffffff", count: 17 },
    { hex: "#3ecf8e", count: 15 },
  ]);
  const greyByKey = Object.fromEntries(greyHeavy.map((t) => [t.key, t.value]));
  assert(
    "a neutral never wins the accent over a chromatic colour used less often",
    greyByKey.primary === "#3ecf8e",
    greyByKey.primary,
  );
  assert(
    "and the dark neutral becomes the background",
    greyByKey.bg === "#1c1c1c" && greyByKey.fg === "#ffffff",
    JSON.stringify(greyByKey),
  );

  assert(
    "a brand with no chromatic colour at all still gets an accent",
    Object.fromEntries(
      toPaletteTokens([
        { hex: "#111111", count: 9 },
        { hex: "#f5f5f5", count: 7 },
        { hex: "#888888", count: 4 },
      ]).map((t) => [t.key, t.value]),
    ).primary === "#888888",
  );

  /*
    A site with no contrast between its own colours must NOT be trusted for
    bg/fg, or the very first piece renders dark type on a dark field.
  */
  const flat = toPaletteTokens([
    { hex: "#3a3a3a", count: 10 },
    { hex: "#454545", count: 4 },
  ]);
  const flatByKey = Object.fromEntries(flat.map((token) => [token.key, token.value]));
  assert(
    "a site whose colours are all similar falls back to safe bg/fg",
    flatByKey.bg === "#0b0d10" && flatByKey.fg === "#f5f7fa",
    JSON.stringify(flatByKey),
  );
  assert("a site with no colours at all yields no tokens", toPaletteTokens([]).length === 0);

  // -------------------------------------------------------------------------
  section("Fonts");

  const fonts = extractFontFamilies(PAGE);
  assert("finds the display face", fonts.includes("Fraunces"), fonts.join(", "));
  assert("finds the body face", fonts.includes("Inter"), fonts.join(", "));
  assert(
    "drops the generic fallbacks in the same stack",
    !fonts.some((font) => ["Georgia", "Arial", "serif", "sans-serif"].includes(font)),
    fonts.join(", "),
  );
  assert(
    "ranks by how often each is declared",
    fonts[0] === "Inter",
    fonts.join(", "),
  );

  // -------------------------------------------------------------------------
  section("Metadata and prose");

  const meta = extractMeta(PAGE);
  assert("reads the title", meta.title === "Olivares del Sur | Aceite de oliva de Mendoza");
  assert("reads the description", meta.description?.includes("primera prensada") === true);
  assert("reads og:site_name", meta.siteName === "Olivares del Sur");

  const text = extractText(PAGE);
  assert("keeps the prose", text.includes("El aceite que no se esconde"));
  assert(
    "decodes entities so accents survive",
    text.includes("Maipú") && text.includes("frío") && text.includes("&") ,
    text.slice(0, 120),
  );
  assert("strips script contents", !text.includes("dataLayer"));
  assert("strips style contents", !text.includes("font-family"));
  assert("strips noscript", !text.includes("Activá JavaScript"));
  assert("leaves no tags behind", !/[<>]/.test(text), text.slice(0, 200));
  assert(
    "caps the length so a long page cannot blow up the call",
    extractText("x".repeat(50_000), 1000).length === 1000,
  );

  // -------------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} website assertions pass.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
