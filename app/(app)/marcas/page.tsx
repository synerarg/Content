import type { Metadata } from "next";
import Link from "next/link";
import { Palette, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/app-shell/empty-state";
import { BrandCard } from "@/components/brands/brand-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Marcas",
  description:
    "Brand Kits: identidad, paleta, tipografías, tono y dirección de arte de cada cliente.",
};

export default async function MarcasPage() {
  const supabase = await createClient();

  // RLS scopes this to the caller's workspace; no explicit filter needed.
  const { data: brands, error } = await supabase
    .from("brands")
    .select("id, name, tagline, logo_path, palette")
    .order("name");

  return (
    <>
      <PageHeader
        title="Marcas"
        description="El Brand Kit de cada cliente: identidad, paleta, tipografías, tono y dirección de arte."
        action={
          <Button asChild>
            <Link href="/marcas/nueva">
              <Plus className="size-4" />
              Nueva marca
            </Link>
          </Button>
        }
      />

      {error ? (
        <div className="px-6 py-8 md:px-8">
          <p className="text-sm text-destructive">
            No se pudieron cargar las marcas: {error.message}
          </p>
        </div>
      ) : brands && brands.length > 0 ? (
        <div className="grid gap-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-3 md:px-8">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Palette}
          title="Todavía no hay marcas"
          description="Creá el Brand Kit de tu primer cliente. Es lo que después alimenta tanto el copy como el render de las plantillas."
          action={
            // Outline, because the header already carries this exact action as
            // the screen's one cyan CTA. Two filled buttons for the same
            // destination reads as two choices when there is only one.
            <Button asChild variant="outline">
              <Link href="/marcas/nueva">
                <Plus className="size-4" />
                Nueva marca
              </Link>
            </Button>
          }
        />
      )}
    </>
  );
}
