import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductosLoading() {
  return (
    <>
      <PageHeaderSkeleton withAction />
      <div className="space-y-8 px-6 py-8 md:px-8">
        <div className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
          <Skeleton className="h-4 w-44" />
          <div className="flex items-start gap-4">
            <Skeleton className="size-24 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </>
  );
}
