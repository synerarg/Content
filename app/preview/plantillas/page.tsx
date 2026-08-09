import { PageHeader } from "@/components/app-shell/page-header";
import { TemplateGallery } from "@/components/templates/template-gallery";
import { previewBrand } from "@/lib/preview/fixtures";

export default function PreviewTemplatesPage() {
  return (
    <>
      <PageHeader
        title="Plantillas"
        description="Las composiciones disponibles, con copy de muestra. Cuatro son nuevas y todavía no las miró nadie."
      />
      <TemplateGallery brand={previewBrand} />
    </>
  );
}
