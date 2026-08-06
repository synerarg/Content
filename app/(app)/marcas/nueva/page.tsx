import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { BrandForm } from "@/components/brands/brand-form";
import { defaultBrandFormValues } from "@/lib/schemas/brand";

export const metadata: Metadata = {
  title: "Nueva marca",
  description: "Creá el Brand Kit de un cliente nuevo.",
};

export default function NuevaMarcaPage() {
  return (
    <>
      <PageHeader
        title="Nueva marca"
        description="Todo lo que definas acá es lo que el sistema usa después para escribir y para renderizar."
      />
      <BrandForm mode="create" initialValues={defaultBrandFormValues()} />
    </>
  );
}
