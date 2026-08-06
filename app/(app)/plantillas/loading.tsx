import {
  PageHeaderSkeleton,
  SlidePreviewSkeleton,
} from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { TEMPLATES } from "@/templates/registry";

/*
  The template count is known at build time — the registry is the source of
  truth — so the grid can hold open exactly the right number of cells rather
  than guessing.
*/
export default function PlantillasLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="grid gap-8 px-6 py-8 sm:grid-cols-2 lg:grid-cols-3 md:px-8">
        {TEMPLATES.map((template) => (
          <div key={template.slug} className="space-y-3">
            <SlidePreviewSkeleton />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        ))}
      </div>
    </>
  );
}
