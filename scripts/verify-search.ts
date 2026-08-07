/**
 * Search snippets: what gets highlighted, and what must never be.
 *
 * The interesting half is offset alignment. The snippet matches on an
 * accent-folded copy of the text and then slices the ORIGINAL, so "Maipú" is
 * found by typing "maipu" and still displays with its accent. That only works
 * while the folded copy is exactly as long as the original — fold the whole
 * string at once and every offset after the first accent is wrong, silently,
 * by one character per accent.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-search.ts
 */
import { buildSnippet, searchTerms } from "../lib/search/snippet";

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

const marked = (text: string, terms: string[]) =>
  buildSnippet(text, terms)
    .filter((segment) => segment.match)
    .map((segment) => segment.text);

const joined = (text: string, terms: string[]) =>
  buildSnippet(text, terms)
    .map((segment) => segment.text)
    .join("");

async function main() {
  // -------------------------------------------------------------------------
  section("Which words are highlighted");

  assert(
    "plain words",
    JSON.stringify(searchTerms("planillas presupuesto")) ===
      JSON.stringify(["planillas", "presupuesto"]),
  );
  assert(
    "quotes are stripped so the words inside still highlight",
    searchTerms('"presupuesto perdido"').includes("presupuesto"),
  );
  assert(
    "an excluded term is never highlighted",
    !searchTerms("precios -descuento").includes("descuento"),
    searchTerms("precios -descuento").join(" "),
  );
  assert(
    "stopword-length words are dropped",
    searchTerms("de la web").length === 1,
    searchTerms("de la web").join(" "),
  );
  assert("duplicates collapse", searchTerms("crm CRM crm").length === 1);
  assert("an empty query yields nothing", searchTerms("   ").length === 0);

  // -------------------------------------------------------------------------
  section("Matching");

  const caption =
    "Si tenés que abrir tres planillas para saber cuánto facturaste, no tenés un sistema.";

  assert(
    "finds the word",
    marked(caption, ["planillas"]).length === 1,
    JSON.stringify(marked(caption, ["planillas"])),
  );
  assert(
    "case does not matter",
    marked(caption, ["PLANILLAS"])[0] === "planillas",
    JSON.stringify(marked(caption, ["PLANILLAS"])),
  );
  assert(
    "every occurrence inside the window is marked",
    marked("planillas y más planillas por todos lados", ["planillas"]).length === 2,
  );
  assert(
    "a term that is not there marks nothing",
    marked(caption, ["bicicleta"]).length === 0,
  );

  // -------------------------------------------------------------------------
  section("Accents — the offset trap");

  const accented = "Cosechamos a mano en Maipú, Mendoza, y prensamos en frío.";

  assert(
    "an unaccented query finds an accented word",
    marked(accented, ["maipu"]).length === 1,
    JSON.stringify(marked(accented, ["maipu"])),
  );
  assert(
    "and the accent survives into what is shown",
    marked(accented, ["maipu"])[0] === "Maipú",
    JSON.stringify(marked(accented, ["maipu"])),
  );
  assert(
    "an accented query finds it too",
    marked(accented, ["maipú"])[0] === "Maipú",
    JSON.stringify(marked(accented, ["maipú"])),
  );

  /*
    The regression this section exists for: a match AFTER several accents. Fold
    the whole string at once and each accent shortens it by one, so by the time
    the fourth word is reached the slice is cut mid-word.
  */
  const manyAccents = "Ácido, cálido, óptimo, único — y recién ahí aparece presupuesto.";
  assert(
    "a word after several accented ones is still sliced correctly",
    marked(manyAccents, ["presupuesto"])[0] === "presupuesto",
    JSON.stringify(marked(manyAccents, ["presupuesto"])),
  );

  // -------------------------------------------------------------------------
  section("The window");

  const long = `${"palabra ".repeat(60)}aguja${" palabra".repeat(60)}`;
  const windowed = buildSnippet(long, ["aguja"]);
  const windowText = windowed.map((segment) => segment.text).join("");

  assert("the match is in the window", windowText.includes("aguja"));
  assert(
    "a long text is cut down rather than shown whole",
    windowText.length < 260,
    String(windowText.length),
  );
  assert(
    "the cut is marked with ellipses at both ends",
    windowed[0].text === "…" && windowed[windowed.length - 1].text === "…",
  );

  assert(
    "text with no match still shows an opening",
    buildSnippet(caption, ["bicicleta"]).length === 1,
  );
  assert("empty text yields no segments", buildSnippet("", ["x"]).length === 0);
  assert(
    "whitespace is collapsed so a snippet is one line",
    !joined("una\n\nlínea    partida", []).includes("\n"),
  );

  // -------------------------------------------------------------------------
  section("Nothing is lost or invented");

  /*
    Segments are rendered as React nodes, so markup in the source is inert —
    but the snippet must still not DROP or duplicate characters, or the reader
    is shown something the piece does not say.
  */
  const tricky = 'Un <b>presupuesto</b> con "comillas" & símbolos';
  assert(
    "the reassembled snippet is exactly the source text",
    joined(tricky, ["presupuesto"]) === tricky.replace(/\s+/g, " ").trim(),
    joined(tricky, ["presupuesto"]),
  );
  assert(
    "markup in the source is returned as plain text, never as a tag",
    buildSnippet(tricky, ["presupuesto"]).every(
      (segment) => typeof segment.text === "string",
    ),
  );

  // -------------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} search assertions pass.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
