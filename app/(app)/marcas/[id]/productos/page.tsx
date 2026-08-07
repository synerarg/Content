import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { ProductPanel } from "@/components/brands/product-panel";
import { productRowToProduct } from "@/lib/schemas/product";
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

  return { title: data ? `Productos · ${data.name}` : "Productos" };
}

export default async function ProductosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: brand }, { data: products }] = await Promise.all([
    supabase.from("brands").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("brand_products")
      .select("id, name, description, image_path, has_transparency")
      .eq("brand_id", id)
      .order("created_at", { ascending: true }),
  ]);

  // A brand in another workspace is filtered out by RLS and arrives as "not
  // found" rather than "forbidden", which is the behaviour we want: it does not
  // confirm the row exists.
  if (!brand) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`Productos · ${brand.name}`}
        description="Las fotos reales del producto. El modelo de imagen genera la escena; el producto lo pega el diseño, sin redibujarlo."
        action={
          <Button asChild variant="outline">
            <Link href={`/marcas/${brand.id}`}>
              <ArrowLeft className="size-4" />
              Volver a la marca
            </Link>
          </Button>
        }
      />
      <ProductPanel
        brandId={brand.id}
        products={(products ?? []).map(productRowToProduct)}
      />
    </>
  );
}
