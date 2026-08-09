import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

/*
  Issues a short-lived signed upload URL so the browser PUTs file bytes DIRECTLY
  to Supabase Storage.

  Vercel caps both request and response bodies at 4.5 MB and returns
  413 FUNCTION_PAYLOAD_TOO_LARGE past it. Proxying a logo or a font file through
  this handler would put us on the wrong side of that limit for no benefit, so
  only this small JSON envelope ever crosses the function boundary.
*/

/*
  Two buckets, chosen by kind.

  `brand-assets` is public — a logo and a .woff2 have to be fetchable by the
  browser during rendering and export. `renders` is private: a composed placa is
  unpublished client work, so it is read through signed URLs. Both are covered
  by the same workspace-folder policies (migrations 0003 and 0017).
*/
const BUCKET_BY_KIND = {
  logo: "brand-assets",
  font: "brand-assets",
  product: "brand-assets",
  render: "renders",
} as const;

const LOGO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const FONT_EXTENSIONS = new Set(["woff2"]);
/*
  No SVG for a product, unlike a logo: this is a photograph of a real object and
  a vector file here means someone picked the wrong asset. The bucket's MIME
  allowlist (migration 0007) is the second, independent check.
*/
const PRODUCT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
/*
  PNG only, and it is not a preference.

  The rasterizer produces PNG and the `renders` bucket accepts nothing else
  (migration 0017), so a signed URL for anything other than .png would mint a
  credential for an upload Storage is going to reject — a failure that surfaces
  as a mystery 400 from a different host.
*/
const RENDER_EXTENSIONS = new Set(["png"]);

const requestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("logo"),
    filename: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("font"),
    filename: z.string().min(1).max(200),
    brandId: z.uuid(),
    family: z.string().trim().min(1).max(120),
    weight: z.coerce.number().int().min(100).max(900),
  }),
  z.object({
    kind: z.literal("product"),
    filename: z.string().min(1).max(200),
    brandId: z.uuid(),
  }),
  z.object({
    kind: z.literal("render"),
    filename: z.string().min(1).max(200),
    brandId: z.uuid(),
    slideId: z.uuid(),
  }),
]);

const EXTENSIONS_BY_KIND = {
  logo: LOGO_EXTENSIONS,
  font: FONT_EXTENSIONS,
  product: PRODUCT_EXTENSIONS,
  render: RENDER_EXTENSIONS,
} as const;

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const body = parsed.data;
  const extension = extensionOf(body.filename);

  const allowed = EXTENSIONS_BY_KIND[body.kind];
  if (!allowed.has(extension)) {
    return NextResponse.json(
      { error: `Formato no permitido (.${extension}).` },
      { status: 400 },
    );
  }

  try {
    // The workspace segment is derived from the session, never from the request
    // body. Storage policies also check it, but not accepting it as input means
    // there is no path to attack in the first place.
    const workspaceId = await requireWorkspaceId();
    const supabase = await createClient();

    /*
      A product gets a fresh UUID on every upload instead of a stable per-product
      name. Replacing a product photo in place would leave every already-exported
      piece pointing at bytes that no longer match what was approved, and the
      public bucket is CDN-cached besides. A new object costs nothing and keeps
      the old one resolvable.
    */
    /*
      A render also gets a fresh UUID, and here the reason is sharper than for
      a product: the whole point of persisting it is to hand the URL to
      something that fetches it later — Meta, an email, a preview. Overwriting
      one path would mean a URL whose bytes change underneath whoever is holding
      it, with a CDN in between. A new object per render costs nothing and makes
      "the file at this URL" a fact rather than a race.

      The cost is that renders accumulate. Nothing prunes them yet; that is a
      known and deliberate gap, not an oversight — see HANDOFF.
    */
    const path =
      body.kind === "logo"
        ? `${workspaceId}/logos/${crypto.randomUUID()}.${extension}`
        : body.kind === "product"
          ? `${workspaceId}/${body.brandId}/products/${crypto.randomUUID()}.${extension}`
          : body.kind === "render"
            ? `${workspaceId}/${body.brandId}/${body.slideId}/${crypto.randomUUID()}.png`
            : `${workspaceId}/${body.brandId}/fonts/${slugify(body.family)}-${body.weight}-normal.woff2`;

    const bucket = BUCKET_BY_KIND[body.kind];

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      bucket,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
