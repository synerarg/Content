import { PageHeader } from "@/components/app-shell/page-header";
import { BatchDetail } from "@/components/batch/batch-detail";
import { previewBrand, previewPosts } from "@/lib/preview/fixtures";

export default function PreviewBatchPage() {
  return (
    <>
      <PageHeader
        title="Mantenimiento preventivo para flotas chicas"
        description="Lanzamos el servicio. El argumento es que una camioneta parada un día cuesta más que el service que la habría evitado."
      />
      {/*
        The real component with the real props. Server actions still fire on
        interaction and will fail without a session — deliberately not stubbed:
        a preview that silently succeeds where the app would fail teaches the
        wrong thing. Look, do not click.
      */}
      <BatchDetail
        batchId="00000000-0000-0000-0000-0000000000b1"
        batchTitle="Mantenimiento preventivo — lanzamiento"
        brand={previewBrand}
        posts={previewPosts}
      />
    </>
  );
}
