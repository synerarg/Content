import type { Metadata } from "next";
import Link from "next/link";
import { Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/app-shell/empty-state";
import { SlideEditor } from "@/components/editor/slide-editor";
import { Button } from "@/components/ui/button";
import { typographySchema, defaultBrandFormValues } from "@/lib/schemas/brand";
import { productRowToProduct } from "@/lib/schemas/product";
import type { EditorBrand } from "@/lib/render/use-render-assets";

function toEditorBrand(row: {
  id: string;
  name: string;
  palette: unknown;
  typography: unknown;
  logo_path: string | null;
  brand_fonts: Array<{
    family: string;
    weight: number;
    style: string;
    storage_path: string;
  }>;
  brand_products: Array<{
    id: string;
    name: string;
    description: string | null;
    image_path: string;
    has_transparency: boolean;
  }>;
}): EditorBrand {
  const fallback = defaultBrandFormValues();
  const typography = typographySchema.safeParse(row.typography);

  const palette =
    typeof row.palette === "object" && row.palette !== null && !Array.isArray(row.palette)
      ? (Object.fromEntries(
          Object.entries(row.palette as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ) as Record<string, string>)
      : {};

  return {
    id: row.id,
    name: row.name,
    palette,
    typography: typography.success ? typography.data : fallback.typography,
    logo_path: row.logo_path,
    fonts: row.brand_fonts ?? [],
    products: (row.brand_products ?? []).map(productRowToProduct),
  };
}

export const metadata: Metadata = {
  title: "Editor",
  description: "Editor de una pieza: plantilla, copy, fondo y export PNG.",
};

export default async function EditorPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, name, palette, typography, logo_path, brand_fonts(family, weight, style, storage_path), brand_products(id, name, description, image_path, has_transparency)",
    )
    .order("name");

  const brands = (data ?? []).map(toEditorBrand);

  return (
    <>
      <PageHeader
        title="Editor"
        description="Elegí marca, plantilla y formato. El PNG que descargues es exactamente lo que ves acá."
      />

      {error ? (
        <div className="px-6 py-8 md:px-8">
          <p className="text-sm text-destructive">
            No se pudieron cargar las marcas: {error.message}
          </p>
        </div>
      ) : brands.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="Necesitás una marca primero"
          description="El editor renderiza con los tokens reales de una marca: paleta, tipografías y logo. Creá una para empezar."
          action={
            <Button asChild>
              <Link href="/marcas/nueva">Crear marca</Link>
            </Button>
          }
        />
      ) : (
        <SlideEditor brands={brands} />
      )}
    </>
  );
}
