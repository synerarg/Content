import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { BrandForm } from "@/components/brands/brand-form";
import { brandRowToFormValues } from "@/lib/schemas/brand";
import { Button } from "@/components/ui/button";

/*
  Its own minimal query rather than a share of the page's.

  A brand the caller cannot see is filtered by RLS and falls back to the generic
  title, so the tab never names a row from another workspace — the same reason
  the page itself answers notFound() instead of "forbidden".
*/
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

  return { title: data?.name ?? "Marca" };
}

export default async function EditarMarcaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, tagline, logo_path, palette, typography, tone_of_voice, target_audience, example_captions, art_direction",
    )
    .eq("id", id)
    .maybeSingle();

  // A brand in another workspace is filtered out by RLS, so it arrives here as
  // "not found" rather than "forbidden" — which is the behaviour we want: it
  // does not confirm the row exists.
  if (!brand) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={brand.name}
        description="Los cambios se aplican al próximo contenido que generes con esta marca."
        action={
          <Button asChild variant="outline">
            <Link href={`/marcas/${brand.id}/historial`}>
              <History className="size-4" />
              Historial publicado
            </Link>
          </Button>
        }
      />
      <BrandForm
        mode="edit"
        brandId={brand.id}
        initialValues={brandRowToFormValues(brand)}
      />
    </>
  );
}
