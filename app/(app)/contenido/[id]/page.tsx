import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { BatchDetail, type BatchPost } from "@/components/batch/batch-detail";
import { typographySchema, defaultBrandFormValues } from "@/lib/schemas/brand";
import { productRowToProduct } from "@/lib/schemas/product";
import type { EditorBrand } from "@/lib/render/use-render-assets";
import type { FormatKey } from "@/templates/types";

const SIGNED_URL_TTL = 60 * 60;

/*
  Deliberately a separate, tiny query — not a slice of the page's, which pulls
  every post, slide and font in one go. RLS applies here too, so a batch from
  another workspace falls back to the generic title.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("content_batches")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: data?.title ?? "Lote" };
}

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("content_batches")
    .select(
      `id, title, brief, status, created_at,
       brands (id, name, palette, typography, logo_path,
               brand_fonts (family, weight, style, storage_path),
               brand_products (id, name, description, image_path, has_transparency)),
       posts (id, position, type, caption, hashtags, cta, scheduled_on, scheduled_time,
              slides (id, position, template_slug, format, slots, product_id, background_path, generation_params,
                      background_status, background_error, background_attempts))`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  // RLS filters other workspaces out, so a foreign batch reads as missing
  // rather than forbidden — which is the behaviour we want. A soft-deleted one
  // reads the same way, so navigating back to a deleted batch lands on the
  // not-found page instead of a half-working screen.
  if (!batch || !batch.brands) {
    notFound();
  }

  const brandRow = batch.brands;
  const typography = typographySchema.safeParse(brandRow.typography);
  const palette =
    typeof brandRow.palette === "object" &&
    brandRow.palette !== null &&
    !Array.isArray(brandRow.palette)
      ? (Object.fromEntries(
          Object.entries(brandRow.palette as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ) as Record<string, string>)
      : {};

  const brand: EditorBrand = {
    id: brandRow.id,
    name: brandRow.name,
    palette,
    typography: typography.success
      ? typography.data
      : defaultBrandFormValues().typography,
    logo_path: brandRow.logo_path,
    fonts: brandRow.brand_fonts ?? [],
    products: (brandRow.brand_products ?? []).map(productRowToProduct),
  };

  // Backgrounds live in a private bucket, so the browser needs signed URLs.
  // Signed in one call rather than per slide to keep this to a single round trip.
  const backgroundPaths = (batch.posts ?? [])
    .flatMap((post) => post.slides ?? [])
    .map((slide) => slide.background_path)
    .filter((path): path is string => Boolean(path));

  const signedByPath = new Map<string, string>();
  if (backgroundPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("generated")
      .createSignedUrls(backgroundPaths, SIGNED_URL_TTL);

    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) {
        signedByPath.set(entry.path, entry.signedUrl);
      }
    }
  }

  const posts: BatchPost[] = (batch.posts ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((post) => ({
      id: post.id,
      type: post.type,
      caption: post.caption,
      hashtags: post.hashtags ?? [],
      cta: post.cta,
      scheduledOn: post.scheduled_on,
      scheduledTime: post.scheduled_time,
      slides: (post.slides ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((slide) => ({
          id: slide.id,
          templateSlug: slide.template_slug,
          format: slide.format as FormatKey,
          slots:
            typeof slide.slots === "object" && slide.slots !== null
              ? (slide.slots as Record<string, string>)
              : {},
          productId: slide.product_id,
          backgroundPath: slide.background_path,
          backgroundSignedUrl: slide.background_path
            ? (signedByPath.get(slide.background_path) ?? null)
            : null,
          backgroundBrief:
            typeof slide.generation_params === "object" &&
            slide.generation_params !== null
              ? ((slide.generation_params as Record<string, unknown>)
                  .backgroundBrief as string) || ""
              : "",
          // The queue's state, read back from the row rather than rebuilt in
          // the browser — which is what makes a reload resume instead of
          // restart, and what lets a failure keep its reason.
          backgroundStatus: slide.background_status,
          backgroundError: slide.background_error,
          backgroundAttempts: slide.background_attempts,
        })),
    }));

  return (
    <>
      <PageHeader title={batch.title} description={batch.brief} />
      <BatchDetail
        batchId={batch.id}
        batchTitle={batch.title}
        brand={brand}
        posts={posts}
      />
    </>
  );
}
