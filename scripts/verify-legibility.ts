/**
 * The legibility measurement, against bitmaps whose answer is known.
 *
 * The browser half of this feature cannot be tested from here — it needs
 * html-to-image, a laid-out DOM and a visible tab. So everything that decides
 * anything was deliberately put in a pure function, and this is what holds it
 * down: the glyph/background split, the percentile that catches a headline
 * crossing from dark to bright, and the WCAG thresholds scaled to the size a
 * phone actually shows.
 *
 * The case that matters most is the LAST one. A headline half over a scrim and
 * half over a bright sky averages out to "fine" and is unreadable across half
 * its length; the mean is the wrong statistic and the test proves the code does
 * not use it.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-legibility.ts
 */
import {
  analyzeTextBoxes,
  parseCssRgb,
  requiredRatio,
  PHONE_SCALE,
  type Bitmap,
  type TextBox,
} from "../lib/render/legibility";
import { contrastRatio } from "../lib/color";

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

/** A bitmap painted by a function of x and y. */
function paint(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** A text run covering the whole bitmap, so the box maths stays out of the way. */
function fullBox(overrides: Partial<TextBox> = {}): TextBox {
  return {
    label: "titular",
    color: WHITE,
    fontSize: 80,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    ...overrides,
  };
}

async function main() {
  // -------------------------------------------------------------------------
  section("WCAG thresholds, scaled to what a phone shows");

  // 1080px wide slide read at ~400px: an 88px headline lands around 33px.
  assert(
    "an 88px headline counts as large text",
    requiredRatio(88) === 3,
    String(requiredRatio(88)),
  );
  assert(
    "a 25px detail line does NOT count as large text",
    requiredRatio(25) === 4.5,
    `${requiredRatio(25)} (efectivo ${(25 * PHONE_SCALE).toFixed(1)}px)`,
  );
  assert(
    "the boundary sits where WCAG puts it, at 24 effective px",
    requiredRatio(24 / PHONE_SCALE + 1) === 3 &&
      requiredRatio(24 / PHONE_SCALE - 1) === 4.5,
  );

  // -------------------------------------------------------------------------
  section("Obvious cases");

  const onBlack = analyzeTextBoxes(paint(60, 60, () => BLACK), [fullBox()]);
  assert(
    "white on black passes with the maximum ratio",
    onBlack.ok && onBlack.worst?.ratio === 21,
    String(onBlack.worst?.ratio),
  );

  /*
    White text on a white background.

    The bitmap carries no glyphs, so this is unambiguous: ratio 1, fail. The
    earlier design — classify pixels by how close they are to the text colour —
    threw every one of these pixels away as "glyphs" and reported nothing
    measurable, which is a false all-clear on a slide that is completely
    unreadable.
  */
  const onWhite = analyzeTextBoxes(paint(60, 60, () => WHITE), [fullBox()]);
  assert(
    "white on white fails with the minimum ratio, not a false pass",
    !onWhite.ok && onWhite.worst?.ratio === 1,
    JSON.stringify(onWhite.worst),
  );

  // Mid grey: light text on it is genuinely marginal.
  const grey = paint(60, 60, () => [150, 150, 150]);
  const onGrey = analyzeTextBoxes(grey, [fullBox()]);
  assert(
    "white on mid grey fails the large-text bar",
    !onGrey.ok,
    `${onGrey.worst?.ratio}:1`,
  );

  assert(
    "the measured ratio matches the palette calculator on a flat colour",
    Math.abs((onGrey.worst?.ratio ?? 0) - (contrastRatio("#ffffff", "#969696") ?? 0)) < 0.1,
    `${onGrey.worst?.ratio} vs ${contrastRatio("#ffffff", "#969696")?.toFixed(1)}`,
  );

  // -------------------------------------------------------------------------
  section("Dark text");

  const darkOnLight = analyzeTextBoxes(paint(60, 60, () => [250, 250, 250]), [
    fullBox({ color: BLACK }),
  ]);
  assert(
    "black on near-white passes",
    darkOnLight.ok && (darkOnLight.worst?.ratio ?? 0) > 18,
    String(darkOnLight.worst?.ratio),
  );

  const darkOnDark = analyzeTextBoxes(paint(60, 60, () => [70, 70, 70]), [
    fullBox({ color: BLACK }),
  ]);
  assert(
    "black on dark grey fails",
    !darkOnDark.ok,
    `${darkOnDark.worst?.ratio}:1`,
  );

  // Just above the large-text bar, to prove the threshold is applied and not
  // merely stored: black on #5a5a5a is 3.0:1, which passes for a headline and
  // would fail for small print.
  const marginal = paint(60, 60, () => [90, 90, 90]);
  assert(
    "the same background passes for a headline and fails for small print",
    analyzeTextBoxes(marginal, [fullBox({ color: BLACK, fontSize: 80 })]).ok &&
      !analyzeTextBoxes(marginal, [fullBox({ color: BLACK, fontSize: 25 })]).ok,
  );

  // -------------------------------------------------------------------------
  section("The case the mean would hide");

  /*
    A headline crossing a scrim: dark on the left, bright sky on the right.
    Averaged, the background is mid-grey and the answer is "marginal". What the
    reader sees is a headline that disappears across its right half.
  */
  const halfBright = paint(120, 40, (x) => (x < 60 ? [12, 12, 14] : [235, 238, 245]));
  const crossing = analyzeTextBoxes(halfBright, [fullBox({ color: WHITE })]);

  assert(
    "white text crossing onto a bright sky FAILS",
    !crossing.ok,
    `${crossing.worst?.ratio}:1`,
  );
  assert(
    "and it is judged on the bright half, not on the average",
    (crossing.worst?.ratio ?? 99) < 1.5,
    `${crossing.worst?.ratio}:1 — el promedio habría dado ~4:1`,
  );
  // Same frame, dark text: now the DARK half is the problem, and the percentile
  // has to look at the other end.
  assert(
    "dark text on the same frame is judged on the dark half",
    !analyzeTextBoxes(halfBright, [fullBox({ color: BLACK })]).ok,
  );

  // The same slide with the scrim doing its job everywhere.
  const fullyScrimmed = paint(120, 40, () => [12, 12, 14]);
  assert(
    "the same headline over a scrim that covers the whole width passes",
    analyzeTextBoxes(fullyScrimmed, [fullBox({ color: WHITE })]).ok,
  );

  // A handful of stray bright pixels — a highlight, a speck — must not fail an
  // otherwise fine slide. That is why it is a percentile and not a maximum.
  const specks = paint(120, 40, (x, y) =>
    x === 30 && y === 20 ? [255, 255, 255] : [12, 12, 14],
  );
  assert(
    "a few blown-out pixels do not fail the slide",
    analyzeTextBoxes(specks, [fullBox({ color: WHITE })]).ok,
  );

  // -------------------------------------------------------------------------
  section("Boxes and reporting");

  // Two runs: a big headline over the dark half and small print over the bright
  // half. Only the second should fail, and it should be named as the worst.
  const split = paint(120, 40, (x) => (x < 60 ? [12, 12, 14] : [240, 240, 240]));
  const report = analyzeTextBoxes(split, [
    fullBox({ label: "titular", x: 0, width: 0.5 }),
    fullBox({ label: "bajada", x: 0.5, width: 0.5, fontSize: 25 }),
  ]);

  assert("both runs are measured", report.findings.length === 2);
  assert("the headline over the scrim passes", report.findings[0].ok);
  assert("the small print over the bright half fails", !report.findings[1].ok);
  assert(
    "the worst finding is the one that fails",
    report.worst?.label === "bajada",
    report.worst?.label,
  );
  assert("the report as a whole fails", !report.ok);

  assert(
    "a box outside the bitmap is skipped rather than throwing",
    analyzeTextBoxes(split, [fullBox({ x: 2, width: 0.5 })]).empty,
  );
  assert(
    "no boxes at all reports empty, not a pass with zero findings",
    analyzeTextBoxes(split, []).empty,
  );

  // -------------------------------------------------------------------------
  section("CSS colour parsing");

  assert("rgb()", JSON.stringify(parseCssRgb("rgb(255, 128, 0)")) === "[255,128,0]");
  assert(
    "rgba()",
    JSON.stringify(parseCssRgb("rgba(11, 13, 16, 0.85)")) === "[11,13,16]",
  );
  assert(
    "the space-separated form modern browsers return",
    JSON.stringify(parseCssRgb("rgb(11 13 16 / 85%)")) === "[11,13,16]",
  );
  assert("a colour it cannot read is null, not a guess", parseCssRgb("red") === null);

  // -------------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} legibility assertions pass.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
