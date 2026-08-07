import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/app-shell/empty-state";
import { SearchPanel, type SearchHit } from "@/components/search/search-panel";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Todo lo que la agencia escribió, buscable por texto y por marca.",
};

const MAX_RESULTS = 60;

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marca?: string }>;
}) {
  const { q, marca } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();

  /*
    Brands are always loaded, results only when there is something to search
    for. The filter has to be populated before the first query so the two
    controls appear together rather than the second one materialising after a
    search.
  */
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .order("name");

  let hits: SearchHit[] = [];
  let error: string | null = null;

  if (query.length > 0) {
    const { data, error: rpcError } = await supabase.rpc("search_content", {
      query,
      brand_filter: marca && marca !== "todas" ? marca : undefined,
      max_results: MAX_RESULTS,
    });

    if (rpcError) {
      error = rpcError.message;
    } else {
      hits = (data ?? []).map((row) => ({
        postId: row.post_id,
        batchId: row.batch_id,
        batchTitle: row.batch_title,
        brandId: row.brand_id,
        brandName: row.brand_name,
        postType: row.post_type,
        caption: row.caption ?? "",
        slideText: row.slide_text ?? "",
        scheduledOn: row.scheduled_on,
        createdAt: row.created_at,
      }));
    }
  }

  if (!brands || brands.length === 0) {
    return (
      <>
        <PageHeader
          title="Buscar"
          description="Todo lo que la agencia escribió, buscable por texto y por marca."
        />
        <EmptyState
          icon={Search}
          title="Todavía no hay nada para buscar"
          description="Cuando generes lotes vas a poder encontrar cualquier pieza por su texto, sin abrirlos de a uno."
          action={
            <Link
              href="/contenido"
              className="text-[var(--synera-accent)] underline underline-offset-4"
            >
              Ir a contenido
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Buscar"
        description="Busca en el caption, en el texto de las placas y en el título del lote. Entiende frases entre comillas y -exclusiones."
      />
      <SearchPanel
        query={query}
        brandId={marca ?? "todas"}
        brands={brands}
        hits={hits}
        error={error}
        limit={MAX_RESULTS}
      />
    </>
  );
}
