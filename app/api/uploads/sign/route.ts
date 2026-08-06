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

const BUCKET = "brand-assets";

const LOGO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const FONT_EXTENSIONS = new Set(["woff2"]);

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
]);

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

  const allowed = body.kind === "logo" ? LOGO_EXTENSIONS : FONT_EXTENSIONS;
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

    const path =
      body.kind === "logo"
        ? `${workspaceId}/logos/${crypto.randomUUID()}.${extension}`
        : `${workspaceId}/${body.brandId}/fonts/${slugify(body.family)}-${body.weight}-normal.woff2`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      bucket: BUCKET,
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
