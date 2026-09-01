import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistorialLoading() {
  return (
    <>
      <PageHeaderSkeleton withAction />
      <div className="space-y-8 px-6 py-8 md:px-8">
        <div className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
