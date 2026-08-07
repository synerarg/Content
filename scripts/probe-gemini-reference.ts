/**
 * Does Gemini's interactions API accept an INPUT image?
 *
 * This is the one question in the product-photo design that cannot be answered
 * from the code. The refinement it gates: send the client's product photo as a
 * SCENE REFERENCE so the generated scene's light, perspective and surface match
 * the product that will be composited into it — while the product's own pixels
 * still come from the template, never from the model.
 *
 * The first shape tried, mirroring how the API RETURNS images —
 * `{ type: "image", mime_type, data }` — got past schema validation and was
 * rejected on BILLING, not on shape. Promising, and not proof: a request can
 * fail billing before anything looks at whether the field is understood.
 *
 * So this probe reports three distinct outcomes, and the distinction is the
 * whole point:
 *
 *   - 200 with an image      the field is accepted. Build it.
 *   - 4xx naming the field   the shape is wrong. The answer is in the message.
 *   - 429 / billing          still unanswered. The account needs credit.
 *
 * Costs ONE image generation if it succeeds. It sends a 64x64 synthetic swatch
 * rather than a real photo — the question is whether the field is read at all,
 * and a small body makes the failure modes easier to tell apart.
 *
 * Run:
 *   npx tsx scripts/probe-gemini-reference.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function readEnvLocal(): Record<string, string> {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

// ---------------------------------------------------------------------------
// A PNG, by hand
// ---------------------------------------------------------------------------
//
// Written out rather than committed as a fixture: a binary blob in the repo
// that exists only for one probe is worse than 30 lines that say exactly what
// the bytes are.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A `size`x`size` RGB PNG: a dark amber block centred on white. */
function makeSwatch(size: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // leading filter byte, then RGB
    for (let x = 0; x < size; x++) {
      const inside =
        x > size * 0.3 && x < size * 0.7 && y > size * 0.2 && y < size * 0.85;
      const i = 1 + x * 3;
      row[i] = inside ? 122 : 250;
      row[i + 1] = inside ? 76 : 249;
      row[i + 2] = inside ? 18 : 245;
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  // 10-12 stay 0: deflate, adaptive filtering, no interlace.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

const SCENE_PROMPT = [
  "A weathered oak kitchen counter beside a north-facing window, photographed on a full-frame camera with a fast prime lens.",
  "Match the light, the surface reflectivity and the camera angle of the reference image.",
  "This is an empty set, photographed before the product arrives.",
  "Leave the central area of the frame completely clear and unobstructed: an empty surface, ready to have an object placed on it.",
  "There is NO product, NO bottle, NO jar, NO box, NO packaging and NO container anywhere in the image.",
  "The image contains absolutely no text of any kind. No letters, no words, no numbers, no logos, no watermarks.",
].join(" ");

async function main() {
  const env = readEnvLocal();
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Falta GEMINI_API_KEY en .env.local");
    process.exitCode = 1;
    return;
  }

  const model = env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const swatch = makeSwatch(64);
  console.log(`Reference swatch: ${swatch.length} bytes, model ${model}\n`);

  const body = {
    model,
    input: [
      { type: "text", text: SCENE_PROMPT },
      {
        // The shape under test. Mirrors how the API RETURNS an image, which is
        // the only documented example of an image part that exists.
        type: "image",
        mime_type: "image/png",
        data: swatch.toString("base64"),
      },
    ],
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: "4:5",
      image_size: "2K",
    },
  };

  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const durationMs = Date.now() - started;

  console.log(`HTTP ${response.status} in ${durationMs}ms`);

  if (!response.ok) {
    console.log(raw.slice(0, 1200));

    if (/prepayment credits|credits are depleted|billing|quota/i.test(raw)) {
      console.log(
        "\nVERDICT: STILL UNANSWERED. The request died on billing or quota, which",
        "\nhappens before anything decides whether the image part is understood.",
        "\nThe account needs credit for this probe to mean anything.",
      );
      process.exitCode = 2;
      return;
    }

    console.log(
      "\nVERDICT: REJECTED ON SHAPE. The message above is the answer — it names",
      "\nthe field or the type the API actually wants.",
    );
    process.exitCode = 1;
    return;
  }

  const payload = JSON.parse(raw) as {
    usage?: { total_input_tokens?: number; total_output_tokens?: number };
    steps?: Array<{ content?: Array<{ type?: string; mime_type?: string; data?: string }> }>;
  };

  const part = (payload.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .find((item) => item?.type === "image" && item.data);

  if (!part?.data) {
    console.log(raw.slice(0, 1200));
    console.log(
      "\nVERDICT: ACCEPTED THE INPUT BUT RETURNED NO IMAGE. Probably a filtered",
      "\nprompt rather than a rejected field.",
    );
    process.exitCode = 1;
    return;
  }

  const bytes = Buffer.from(part.data, "base64");
  const out = new URL("../scene-reference-probe.jpg", import.meta.url).pathname;
  writeFileSync(out.startsWith("/") && out[2] === ":" ? out.slice(1) : out, bytes);

  console.log(`\nGot ${bytes.length} bytes back, written to ${out}`);
  console.log(
    `input tokens: ${payload.usage?.total_input_tokens ?? "?"}, ` +
      `output tokens: ${payload.usage?.total_output_tokens ?? "?"}`,
  );
  console.log(
    "\nVERDICT: ACCEPTED. The interactions API takes an input image, so the scene",
    "\nreference is buildable. Look at the file before believing it: the question",
    "\nthat matters next is whether the scene came back EMPTY, or whether the model",
    "\ntreated the reference as something to draw.",
  );
}

void main();
