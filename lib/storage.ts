import { createClient } from "@/lib/supabase/client";

/** The public bucket. Only `publicAssetUrl` names a bucket now — uploads read
 *  it off the sign response, because not every kind goes to the same one. */
const PUBLIC_BUCKET = "brand-assets";

type SignRequest =
  | { kind: "logo"; filename: string }
  | {
      kind: "font";
      filename: string;
      brandId: string;
      family: string;
      weight: number;
    }
  | { kind: "product"; filename: string; brandId: string }
  | { kind: "render"; filename: string; brandId: string; slideId: string };

/*
  The bucket enforces `allowed_mime_types` (migration 0007), and for a Blob body
  storage-js sends multipart — so the type the server records is the one the
  BROWSER put on the File, not anything we pass in `fileOptions`. That value
  comes from the OS registry and is `""` often enough to matter: Windows has no
  registered type for .woff2, and .svg is missing on plenty of machines too. An
  empty type arrives as application/octet-stream and the bucket rejects it.

  So the type is derived from the extension the sign route already validated,
  and the file re-wrapped when it disagrees. Re-wrapping is a header change, not
  a copy: File keeps its underlying blob data.
*/
const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  woff2: "font/woff2",
};

function withDeclaredType(file: File): File {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expected = MIME_BY_EXTENSION[extension];
  if (!expected || file.type === expected) return file;
  return new File([file], file.name, {
    type: expected,
    lastModified: file.lastModified,
  });
}

/**
 * Upload a file straight to Supabase Storage.
 *
 * The route handler only mints a signed URL; the bytes go browser -> Storage
 * and never touch a Vercel function, which is what keeps us clear of the
 * 4.5 MB request-body cap.
 */
export async function uploadViaSignedUrl(
  file: File,
  request: SignRequest,
): Promise<string> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!signRes.ok) {
    const payload = await signRes.json().catch(() => ({}));
    throw new Error(payload.error ?? "No se pudo preparar la subida.");
  }

  /*
    The bucket comes from the RESPONSE, not from a constant here. A render goes
    to the private `renders` bucket and everything else to `brand-assets`; the
    route already decides that from the kind, and having the browser decide it a
    second time is a rule in two places waiting to disagree.
  */
  const { bucket, path, token } = (await signRes.json()) as {
    bucket: string;
    path: string;
    token: string;
  };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, withDeclaredType(file));

  if (error) throw new Error(error.message);

  return path;
}

/**
 * Public URL for an object in the brand-assets bucket.
 *
 * Built from the env var rather than `supabase.storage.getPublicUrl()` so it
 * works unchanged in Server Components, where instantiating a browser client
 * is not possible.
 */
export function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}
