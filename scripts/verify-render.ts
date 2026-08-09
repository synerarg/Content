/**
 * The render fingerprint — the thing standing between a stored PNG and a lie.
 *
 * A persisted render is a photograph of a placa at a moment, and it stays a
 * perfectly valid PNG at a perfectly valid URL long after the placa has
 * changed. Nothing about the file announces that. The fingerprint is the only
 * mechanism that notices, and it fails in a direction nobody would see: a hash
 * that MISSED an input would quietly report a stale render as current, and
 * something downstream — eventually Instagram — would publish yesterday's copy.
 *
 * So the central section is not "the hash is stable". It is: change ANY input
 * that changes the pixels, one at a time, and the hash must move. Every field
 * in `FingerprintInput` is walked, so a field added later without being wired
 * into the payload fails here rather than in production.
 *
 * Two more failure modes with their own sections:
 *
 *   - KEY ORDER. `JSON.stringify` preserves insertion order, so a slots record
 *     rebuilt from the registry's declaration order and one read back from a
 *     jsonb column do not agree. Left unhandled, every render on the page shows
 *     as stale after a reload — the feature crying wolf until nobody reads it.
 *   - COLLISIONS. FNV-1a is 32 bits, which by the birthday bound collides at
 *     roughly one pair in 65,000. That is close enough to a real workspace's
 *     render count to matter, which is why the hash is two halves.
 *
 * No network, no API key, no cost.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-render.ts
 */
import {
  fingerprintPayload,
  isRenderCurrent,
  renderFingerprint,
  type FingerprintInput,
} from "../lib/export/render-fingerprint";

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

const BASE: FingerprintInput = {
  templateSlug: "bold-headline",
  format: "feed",
  slots: {
    headline: "Tu CRM no es un gasto",
    subline: "Tres horas por semana que hoy se te van en planillas.",
    cta: "Ver cómo",
  },
  backgroundPath: "ws/brand/backgrounds/abc.png",
  productId: null,
  productHasTransparency: null,
  palette: { bg: "#0b0d10", fg: "#f5f7fa", primary: "#84e9ff" },
  displayFamily: "Poppins",
  displayWeight: 700,
  bodyFamily: "Poppins",
  bodyWeight: 400,
  logoPath: "ws/logos/logo.png",
};

/** Every field, paired with a value that must produce a different hash. */
const MUTATIONS: Array<[keyof FingerprintInput, string, Partial<FingerprintInput>]> = [
  ["templateSlug", "otra plantilla", { templateSlug: "statement" }],
  ["format", "historia en vez de feed", { format: "story" }],
  [
    "slots",
    "una palabra del titular",
    { slots: { ...BASE.slots, headline: "Tu CRM no es un costo" } },
  ],
  [
    "slots",
    "un slot opcional que se vacía",
    { slots: { ...BASE.slots, cta: "" } },
  ],
  [
    "backgroundPath",
    "fondo regenerado",
    { backgroundPath: "ws/brand/backgrounds/xyz.png" },
  ],
  ["backgroundPath", "fondo quitado", { backgroundPath: null }],
  ["productId", "producto asignado", { productId: "prod-1" }],
  [
    "productHasTransparency",
    "el recorte del producto",
    { productHasTransparency: true },
  ],
  [
    "palette",
    "el acento de la marca",
    { palette: { ...BASE.palette, primary: "#ff5500" } },
  ],
  [
    "palette",
    "un token nuevo en la paleta",
    { palette: { ...BASE.palette, "on-primary": "#000000" } },
  ],
  ["displayFamily", "la tipografía de display", { displayFamily: "Fraunces" }],
  ["displayWeight", "el peso de display", { displayWeight: 600 }],
  ["bodyFamily", "la tipografía de texto", { bodyFamily: "Inter" }],
  ["bodyWeight", "el peso de texto", { bodyWeight: 500 }],
  ["logoPath", "el logo", { logoPath: "ws/logos/otro.png" }],
  ["logoPath", "marca sin logo", { logoPath: null }],
];

function main() {
  const base = renderFingerprint(BASE);

  // ---------------------------------------------------------------------
  section("Estabilidad");

  assert("la misma entrada da la misma huella", renderFingerprint(BASE) === base);
  assert(
    "un objeto equivalente construido aparte da la misma huella",
    renderFingerprint({ ...BASE, slots: { ...BASE.slots } }) === base,
  );
  assert(
    "la huella es hexadecimal y de largo fijo",
    /^[0-9a-f]{16}$/.test(base),
    base,
  );
  /*
    The column the action validates against is max(64). A hash that outgrew it
    would be rejected at write time with a message about "datos inválidos",
    which is a long way from the cause.
  */
  assert("entra en el límite de 64 que valida la acción", base.length <= 64);

  // ---------------------------------------------------------------------
  section("Sensibilidad — todo lo que cambia los píxeles mueve la huella");

  for (const [field, why, patch] of MUTATIONS) {
    const mutated = renderFingerprint({ ...BASE, ...patch });
    assert(
      `${String(field)}: ${why}`,
      mutated !== base,
      `${base} vs ${mutated}`,
    );
  }

  /*
    The list above must cover the type, or a field added later silently stops
    being part of the fingerprint. This is the assertion that makes the section
    self-maintaining rather than a snapshot of what someone remembered.
  */
  const covered = new Set(MUTATIONS.map(([field]) => field));
  const uncovered = (Object.keys(BASE) as Array<keyof FingerprintInput>).filter(
    (field) => !covered.has(field),
  );
  assert(
    "no queda ningún campo de FingerprintInput sin probar",
    uncovered.length === 0,
    uncovered.join(", "),
  );

  // ---------------------------------------------------------------------
  section("Orden de claves — el que haría gritar 'desactualizada' a todo");

  const reordered: FingerprintInput = {
    ...BASE,
    slots: {
      cta: BASE.slots.cta,
      headline: BASE.slots.headline,
      subline: BASE.slots.subline,
    },
    palette: {
      primary: BASE.palette.primary,
      bg: BASE.palette.bg,
      fg: BASE.palette.fg,
    },
  };
  assert(
    "reordenar los slots y la paleta no cambia nada",
    renderFingerprint(reordered) === base,
    `${base} vs ${renderFingerprint(reordered)}`,
  );

  /*
    Deliberate, not incidental: a slot present-and-empty is NOT the same as a
    slot absent. `alignSlots` in lib/ai/generate-batch.ts fills every declared
    key, and `emptySlots` in the registry does the same, so both writers agree —
    but if one ever stops, this is the assertion that says so out loud instead
    of letting renders flip to stale for no visible reason.
  */
  const withoutCta = { ...BASE.slots };
  delete (withoutCta as Record<string, string>).cta;
  assert(
    "un slot ausente NO equivale a un slot vacío (decidido, no accidental)",
    renderFingerprint({ ...BASE, slots: withoutCta }) !==
      renderFingerprint({ ...BASE, slots: { ...BASE.slots, cta: "" } }),
  );

  // ---------------------------------------------------------------------
  section("Colisiones");

  /*
    2000 realistic variations — the scale of a workspace with a year of batches.
    A single 32-bit FNV would be expected to collide about 30 times in this set;
    the two-half construction should produce none.
  */
  const seen = new Map<string, string>();
  let collisions = 0;
  let firstCollision = "";

  for (let index = 0; index < 2000; index++) {
    const input: FingerprintInput = {
      ...BASE,
      slots: {
        headline: `Titular número ${index}`,
        subline: `Bajada ${index % 7} con algo más de texto detrás`,
        cta: index % 3 === 0 ? "" : `Acción ${index % 11}`,
      },
      backgroundPath: `ws/brand/backgrounds/${index}.png`,
    };
    const key = JSON.stringify(input);
    const hash = renderFingerprint(input);
    const previous = seen.get(hash);
    if (previous && previous !== key) {
      collisions++;
      if (!firstCollision) firstCollision = hash;
    }
    seen.set(hash, key);
  }

  assert(
    "2000 variaciones realistas no colisionan",
    collisions === 0,
    `${collisions} colisiones, la primera en ${firstCollision}`,
  );

  assert(
    "el payload contiene el texto de los slots (y no sólo sus claves)",
    fingerprintPayload(BASE).includes("Tu CRM no es un gasto"),
  );

  // ---------------------------------------------------------------------
  section("isRenderCurrent");

  assert("igual a la actual: vigente", isRenderCurrent(base, base));
  assert("distinta: desactualizada", !isRenderCurrent("0000000000000000", base));
  // A slide that was never saved must not read as current. It is the default
  // state of every slide in the app, so getting it backwards would show a
  // "PNG guardado" chip on placas that have no PNG at all.
  assert("null: no vigente", !isRenderCurrent(null, base));
  assert("undefined: no vigente", !isRenderCurrent(undefined, base));
  assert("cadena vacía: no vigente", !isRenderCurrent("", base));

  // ---------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} render assertions pass.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
