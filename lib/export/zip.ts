import JSZip from "jszip";

/*
  ZIP assembly, entirely in the browser.

  This is deliberate, not incidental: Vercel caps request AND response bodies at
  4.5 MB, and a batch with one carousel is already several megabytes of PNG.
  Building the archive server-side would mean either streaming the images up to
  a function and back down, or hitting 413 â€” so the bytes never leave the client.
*/

export type ZipEntry =
  | { path: string; blob: Blob }
  | { path: string; text: string };

export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();

  for (const entry of entries) {
    if ("blob" in entry) {
      // PNGs are already DEFLATE-compressed internally. Re-compressing them
      // costs real seconds across a batch and saves almost nothing, so images
      // are stored and only text is compressed.
      zip.file(entry.path, entry.blob, { compression: "STORE" });
    } else {
      zip.file(entry.path, entry.text, {
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
    }
  }

  return zip.generateAsync({ type: "blob" });
}

/** Filesystem-safe slug for folder and file names inside the archive. */
export function slugify(value: string, fallback = "sin-titulo"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    // Combining diacritical marks, written as escapes rather than literal
    // characters so the range survives any re-encoding of this file.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    // Truncate before trimming separators, so a title cut at the limit cannot
    // end on a stray dash.
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** The caption file that ships next to each post's images. */
export function buildCaptionMarkdown({
  batchTitle,
  brandName,
  postIndex,
  postType,
  caption,
  hashtags,
  cta,
  slideCount,
  scheduleLabel,
}: {
  batchTitle: string;
  brandName: string;
  postIndex: number;
  postType: string;
  caption: string;
  hashtags: string[];
  cta: string;
  slideCount: number;
  /**
   * Pre-formatted, so this file stays a formatter of what it is handed rather
   * than growing an opinion about dates. Null renders an explicit "sin fecha":
   * the caption file is what reaches whoever publishes, and a missing line
   * reads as "any time" rather than as "nobody decided yet".
   */
  scheduleLabel?: string | null;
}): string {
  const tags = hashtags.map((tag) => `#${tag}`).join(" ");

  return [
    `# ${brandName} â€” pieza ${String(postIndex + 1).padStart(2, "0")}`,
    "",
    `- Lote: ${batchTitle}`,
    `- Tipo: ${postType}`,
    `- Placas: ${slideCount}`,
    `- Publicar: ${scheduleLabel ?? "sin fecha asignada"}`,
    "",
    "## Caption",
    "",
    caption || "_(sin caption)_",
    "",
    ...(cta ? ["## CTA", "", cta, ""] : []),
    ...(tags ? ["## Hashtags", "", tags, ""] : []),
    "---",
    "",
    "Para publicar: copiÃ¡ el caption y los hashtags, y subÃ­ las imÃ¡genes en orden.",
  ].join("\n");
}
