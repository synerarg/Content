import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/*
  Mirrors BrandForm's section rhythm: a 240px label column beside the fields,
  each section separated by a hairline.
*/
export default function EditarMarcaLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="px-6 pb-16 md:px-8">
        {Array.from({ length: 4 }, (_, section) => (
          <div
            key={section}
            className="grid gap-6 border-b border-border py-8 md:grid-cols-[240px_1fr]"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
