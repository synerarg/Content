/**
 * Product photos — invariants that hold without touching a provider.
 *
 * Everything in the product feature except the actual image generation can be
 * checked from here, and most of it is the kind of thing that fails silently:
 * a scene prompt that forgets to ask for an empty staging area produces a
 * perfectly good photograph with somebody else's bottle in it, and nothing
 * downstream notices.
 *
 * Run:
 *   npx tsx --require ./scripts/_stub-server-only.cjs scripts/verify-products.ts
 */
import {
  PRODUCT_TEMPLATES,
  TEMPLATES,
  isSlotRequired,
  slotLabel,
  templateUsesBackground,
  templateUsesProduct,
} from "../templates/registry";
import { composeImagePrompt } from "../prompts/image-prompt";
import { buildBatchUserPrompt } from "../prompts/batch-generation";
import { productFormSchema } from "../lib/schemas/product";
import { removeFlatBackground } from "../lib/products/prepare-image";

let failures = 0;
let checks = 0;

function assert(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

const ART_DIRECTION = {
  photographic_style: "Fotografía documental, sin pose.",
  lighting: "luz natural de mañana",
  palette_notes: "tonos cálidos",
  avoid: ["gente sonriendo a cámara"],
};

/** Synthetic ImageData: canvas is not available here and is not needed. */
function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

async function main() {
  // -------------------------------------------------------------------------
  section("Registry");

  assert(
    "at least one template composites a product",
    PRODUCT_TEMPLATES.length > 0,
  );

  assert(
    "PRODUCT_TEMPLATES contains only templates that declare usesProduct",
    PRODUCT_TEMPLATES.every((t) => t.usesProduct === true),
  );

  assert(
    "templateUsesProduct agrees with the registry",
    TEMPLATES.every(
      (t) => templateUsesProduct(t.slug) === (t.usesProduct === true),
    ),
  );

  assert(
    "an unknown slug does not claim to need a product",
    templateUsesProduct("no-existe") === false,
  );

  for (const template of PRODUCT_TEMPLATES) {
    assert(
      `${template.slug}: has at least one required slot`,
      Object.keys(template.slots.shape).some((key) =>
        isSlotRequired(template, key),
      ),
    );

    const unlabelled = Object.keys(template.slots.shape).filter(
      (key) => slotLabel(template, key) === key.replace(/_/g, " "),
    );
    assert(
      `${template.slug}: every slot has a Spanish label`,
      unlabelled.length === 0,
      unlabelled.join(", "),
    );
  }

  // -------------------------------------------------------------------------
  section("Scene prompt");

  /*
    The regression that matters most. A product template whose scene is composed
    freely puts an object exactly where the real product is about to go.
  */
  const withProduct = composeImagePrompt({
    brief: "una mesada de mármol junto a una ventana, vacía",
    artDirection: ART_DIRECTION,
    format: "feed",
    templateSlug: "product-hero",
    hasProduct: true,
  });

  assert(
    "a product scene asks for an empty set",
    /empty set/i.test(withProduct),
  );
  assert(
    "a product scene forbids drawing a product",
    /NO product/.test(withProduct) && /NO packaging/.test(withProduct),
  );
  assert(
    "a product scene still carries the no-text rule",
    /absolutely no text/i.test(withProduct),
  );
  assert(
    "a product scene still carries its composition guidance",
    withProduct.includes("Composition:"),
  );
  assert(
    "the product itself is never named in the scene prompt",
    !/botella|bottle of|the product is a/i.test(withProduct),
  );

  const withoutProduct = composeImagePrompt({
    brief: "un taller de carpintería a media mañana",
    artDirection: ART_DIRECTION,
    format: "feed",
    templateSlug: "bold-headline",
    hasProduct: false,
  });

  assert(
    "a normal background is NOT told to be an empty set",
    !/empty set/i.test(withoutProduct),
  );

  /*
    The pre-existing invariant, re-asserted because two templates were added:
    every template that displays a background must contribute a "Composition:"
    line, or the model composes freely and the type lands on the busiest part of
    the frame.
  */
  const missingComposition = TEMPLATES.filter(
    (t) => templateUsesBackground(t.slug),
  ).filter(
    (t) =>
      !composeImagePrompt({
        brief: "x".repeat(20),
        artDirection: ART_DIRECTION,
        format: "feed",
        templateSlug: t.slug,
        hasProduct: t.usesProduct === true,
      }).includes("Composition:"),
  );

  assert(
    "every background template has composition guidance",
    missingComposition.length === 0,
    missingComposition.map((t) => t.slug).join(", "),
  );

  // -------------------------------------------------------------------------
  section("Batch prompt");

  const base = {
    brandName: "Olivares del Sur",
    toneOfVoice: "Rioplatense, directo.",
    targetAudience: "Cocineros aficionados.",
    exampleCaptions: ["Un aceite que no se esconde."],
    brief: "lanzamiento de la cosecha 2026",
    recipe: [
      { type: "feed" as const, count: 1, slides: 1 },
      { type: "story" as const, count: 2, slides: 1 },
    ],
  };

  const productPrompt = buildBatchUserPrompt({
    ...base,
    product: {
      name: "Aceite de oliva 500 ml",
      description: "Primera prensada en frío, de Maipú.",
    },
    productTemplateSlugs: PRODUCT_TEMPLATES.map((t) => t.slug),
  });

  assert(
    "the product prompt names the product",
    productPrompt.includes("Aceite de oliva 500 ml"),
  );
  assert(
    "the product prompt carries the description",
    productPrompt.includes("Primera prensada en frío"),
  );
  assert(
    "the product prompt names every product template",
    PRODUCT_TEMPLATES.every((t) => productPrompt.includes(t.slug)),
  );
  assert(
    "the product prompt asks for an EMPTY scene brief",
    /lugar VAC[ÍI]O/.test(productPrompt),
  );
  assert(
    "the product section comes before the brief",
    productPrompt.indexOf("PRODUCTO DEL LOTE") <
      productPrompt.indexOf("BRIEF DEL LOTE"),
  );

  const plainPrompt = buildBatchUserPrompt(base);
  assert(
    "a batch with no product emits no product section",
    !plainPrompt.includes("PRODUCTO DEL LOTE"),
  );

  // -------------------------------------------------------------------------
  section("Product form schema");

  assert(
    "a product without an image is rejected",
    !productFormSchema.safeParse({
      name: "Botella",
      description: "",
      image_path: "",
      has_transparency: false,
    }).success,
  );
  assert(
    "a product without a name is rejected",
    !productFormSchema.safeParse({
      name: "   ",
      description: "",
      image_path: "ws/brand/products/a.webp",
      has_transparency: false,
    }).success,
  );
  assert(
    "a complete product is accepted",
    productFormSchema.safeParse({
      name: "Botella 500 ml",
      description: "Aceite de oliva.",
      image_path: "ws/brand/products/a.webp",
      has_transparency: true,
    }).success,
  );

  // -------------------------------------------------------------------------
  section("Flat-backdrop cut-out");

  /*
    These guard rails are the whole safety of the feature. The algorithm
    producing a slightly wrong edge is cosmetic; the algorithm silently eating
    the product, or claiming success on a photo it could not handle, is a file
    that reaches a client.
  */
  const productOnWhite = makeImage(96, 96, (x, y) =>
    x >= 30 && x < 66 && y >= 30 && y < 66 ? [20, 20, 20] : [252, 252, 250],
  );
  const cut = removeFlatBackground(productOnWhite);
  assert(
    "a dark product on a white sweep is cut out",
    cut.status === "done",
    cut.status === "refused" ? cut.reason : cut.status,
  );
  if (cut.status === "done") {
    assert(
      "the removed share matches the backdrop area",
      cut.removedRatio > 0.8 && cut.removedRatio < 0.9,
      String(cut.removedRatio),
    );
    // The product's own pixels must survive, and the erosion must not have
    // chewed past the boundary into it.
    const centre = (48 * 96 + 48) * 4 + 3;
    assert(
      "the product stays fully opaque at its centre",
      productOnWhite.data[centre] === 255,
      String(productOnWhite.data[centre]),
    );
    const corner = 3;
    assert("the backdrop is fully transparent", productOnWhite.data[corner] === 0);
  }

  const busy = makeImage(96, 96, (x, y) => [
    (x * 3) % 256,
    (y * 5) % 256,
    (x * y) % 256,
  ]);
  assert(
    "a photo whose corners disagree is refused, not mangled",
    removeFlatBackground(busy).status === "refused",
  );

  const blank = makeImage(96, 96, () => [250, 250, 250]);
  const blankResult = removeFlatBackground(blank);
  assert(
    "an image that is all backdrop is refused rather than erased",
    blankResult.status === "refused",
    blankResult.status,
  );

  // A product filling almost the whole frame leaves too little backdrop for the
  // flood to be meaningful — better to say so than to shave a 2% border.
  const edgeToEdge = makeImage(96, 96, (x, y) =>
    x >= 1 && x < 95 && y >= 1 && y < 95 ? [30, 40, 60] : [252, 252, 250],
  );
  assert(
    "a product filling the frame is refused",
    removeFlatBackground(edgeToEdge).status === "refused",
  );

  // -------------------------------------------------------------------------
  console.log(
    failures === 0
      ? `\nAll ${checks} product assertions pass.`
      : `\n${failures} of ${checks} FAILED — do not ship.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
