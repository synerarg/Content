import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { TemplateGallery } from "@/components/templates/template-gallery";
import { typographySchema, defaultBrandFormValues } from "@/lib/schemas/brand";
import { productRowToProduct } from "@/lib/schemas/product";
import type { EditorBrand } from "@/lib/render/use-render-assets";

export const metadata: Metadata = {
  title: "Plantillas",
  description:
    "Las plantillas disponibles y los formatos que soporta cada una.",
};

export default async function PlantillasPage() {
  const supabase = await createClient();

  // Preview with a real brand when one exists, so the gallery shows actual
  // typography rather than a generic mock.
  const { data } = await supabase
    .from("brands")
    .select(
      "id, name, palette, typography, logo_path, brand_fonts(family, weight, style, storage_path), brand_products(id, name, description, image_path, has_transparency)",
    )
    .order("name")
    .limit(1)
    .maybeSingle();

  let brand: EditorBrand | null = null;
  if (data) {
    const typography = typographySchema.safeParse(data.typography);
    const palette =
      typeof data.palette === "object" &&
      data.palette !== null &&
      !Array.isArray(data.palette)
        ? (Object.fromEntries(
            Object.entries(data.palette as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          ) as Record<string, string>)
        : {};

    brand = {
      id: data.id,
      name: data.name,
      palette,
      typography: typography.success
        ? typography.data
        : defaultBrandFormValues().typography,
      logo_path: data.logo_path,
      fonts: data.brand_fonts ?? [],
      products: (data.brand_products ?? []).map(productRowToProduct),
    };
  }

  return (
    <>
      <PageHeader
        title="Plantillas"
        description="Componentes de diseño que renderizan el texto con los tokens reales de cada marca. Cada una declara sus slots y los formatos que soporta."
      />
      <TemplateGallery brand={brand} />
    </>
  );
}
