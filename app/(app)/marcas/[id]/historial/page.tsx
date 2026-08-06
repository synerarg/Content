import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  HistoryPanel,
  type PublishedPost,
} from "@/components/brands/history-panel";
import { historyAnalysisSchema } from "@/lib/ai/analyze-history";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: data ? `Historial · ${data.name}` : "Historial" };
}

export default async function HistorialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: brand }, { data: posts }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name, content_analysis, content_analysis_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("brand_published_posts")
      .select("id, caption, source, published_at, created_at")
      .eq("brand_id", id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!brand) {
    notFound();
  }

  // The column is `jsonb not null default '{}'`, so an unanalysed brand parses
  // as a miss rather than an error. Validated rather than cast: this is model
  // output that was written by a previous version of the extraction prompt and
  // may not match the current shape.
  const parsed = historyAnalysisSchema.safeParse(brand.content_analysis);
  const analysis = parsed.success && parsed.data.angles.length > 0 ? parsed.data : null;

  const published: PublishedPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    caption: post.caption,
    source: post.source,
    publishedAt: post.published_at,
    createdAt: post.created_at,
  }));

  return (
    <>
      <PageHeader
        title={`Historial · ${brand.name}`}
        description="Lo que esta marca ya publicó. Se usa para que los lotes nuevos no repitan los mismos argumentos."
        action={
          <Button asChild variant="outline">
            <Link href={`/marcas/${brand.id}`}>
              <ArrowLeft className="size-4" />
              Volver a la marca
            </Link>
          </Button>
        }
      />
      <HistoryPanel
        brandId={brand.id}
        posts={published}
        analysis={analysis}
        analysedAt={brand.content_analysis_at}
      />
    </>
  );
}
