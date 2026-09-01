import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConfiguracionLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-10 px-6 py-8 md:px-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-2xl border border-border bg-card glass-card p-4"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </div>

        {Array.from({ length: 2 }, (_, section) => (
          <div key={section} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
              {Array.from({ length: 2 }, (_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
