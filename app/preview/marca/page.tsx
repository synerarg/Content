import { PageHeader } from "@/components/app-shell/page-header";
import { BrandForm } from "@/components/brands/brand-form";
import { defaultBrandFormValues } from "@/lib/schemas/brand";

export default function PreviewBrandFormPage() {
  return (
    <>
      <PageHeader
        title="Nueva marca"
        description="Todo lo que definas acá es lo que el sistema usa después para escribir y para renderizar."
      />
      {/* Empty, which is the state that matters: this is the screen someone
          faces the first time they add a client, and the one where the Tab
          completion on the placeholders has to be discoverable. */}
      <BrandForm mode="create" initialValues={defaultBrandFormValues()} />
    </>
  );
}
