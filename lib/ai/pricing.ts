/**
 * Token pricing, for the cost estimate written to every `generations` row.
 *
 * Rates are USD per million tokens. Claude Sonnet 5 carries introductory
 * pricing of $2/$10 through 2026-08-31, reverting to $3/$15 after that — so the
 * rate is resolved against the call's own timestamp rather than hardcoded, and
 * historical rows stay accurate once the intro period lapses.
 */

export type TokenRates = { input: number; output: number };

const SONNET_5_INTRO_ENDS = Date.parse("2026-09-01T00:00:00Z");

const RATES: Record<string, (at: number) => TokenRates> = {
  "claude-sonnet-5": (at) =>
    at < SONNET_5_INTRO_ENDS
      ? { input: 2, output: 10 }
      : { input: 3, output: 15 },
  "claude-opus-5": () => ({ input: 5, output: 25 }),
  "claude-haiku-4-5": () => ({ input: 1, output: 5 }),
};

/** Cache reads bill at ~0.1x input; cache writes at ~1.25x (5-minute TTL). */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export type UsageCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function estimateCostUsd(
  model: string,
  usage: UsageCounts,
  at: number = Date.now(),
): number | null {
  const resolve = RATES[model];
  if (!resolve) return null;

  const rates = resolve(at);
  const cost =
    (usage.inputTokens * rates.input +
      usage.cacheReadTokens * rates.input * CACHE_READ_MULTIPLIER +
      usage.cacheWriteTokens * rates.input * CACHE_WRITE_MULTIPLIER +
      usage.outputTokens * rates.output) /
    1_000_000;

  // 6dp matches the numeric(12,6) column; a single caption lands around $0.002.
  return Number(cost.toFixed(6));
}

/**
 * Image pricing, in USD per megapixel — the unit most image providers bill in.
 *
 * A 4:5 background at 1088x1360 is ~1.48 MP (~US$0.018); a 9:16 at 1152x2048 is
 * ~2.36 MP (~US$0.028). Backgrounds therefore cost noticeably more per piece
 * than the copy does.
 */
const IMAGE_RATES_PER_MEGAPIXEL: Record<string, number> = {
  "fal-ai/flux-2": 0.012,
  "fal-ai/flux-2/lora": 0.021,
};

/**
 * Providers that bill per image rather than per megapixel.
 *
 * Gemini image models are free up to the daily free-tier allowance (500/day for
 * 2.5 Flash Image), which is the tier this project runs on — hence 0. If usage
 * ever moves to a paid tier these need revisiting; a wrong number here is worse
 * than no number, so unknown models return null and the UI shows a dash.
 */
const IMAGE_RATES_PER_IMAGE: Record<string, number> = {
  "gemini-2.5-flash-image": 0,
  "gemini-3.1-flash-image": 0,
  "gemini-3.1-flash-lite-image": 0,
};

export function estimateImageCostUsd(
  model: string,
  megapixels: number,
): number | null {
  const perImage = IMAGE_RATES_PER_IMAGE[model];
  if (perImage !== undefined) return perImage;

  const rate = IMAGE_RATES_PER_MEGAPIXEL[model];
  if (rate === undefined) return null;
  return Number((rate * megapixels).toFixed(6));
}

export function formatCostUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  // A genuine zero — a free-tier Gemini image, or a workspace that has not
  // generated anything yet. "US$0.0000" implies a measurement too small to
  // show; "US$0" says what actually happened.
  if (value === 0) return "US$0";
  if (value < 0.01) return `US$${value.toFixed(4)}`;
  return `US$${value.toFixed(2)}`;
}
