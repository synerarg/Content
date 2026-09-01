import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/*
  The month grid is a FIXED six rows, so this holds exactly the height the real
  one will occupy. That matters more here than on most routes: the page is a
  single tall block, and a skeleton even one row short drops everything below it
  by 96px the moment the data lands.
*/
export default function CalendarioLoading() {
  return (
    <>
      <PageHeaderSkeleton withAction />
      <div className="space-y-6 px-6 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="ml-2 h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-48 rounded-md" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex justify-center px-2 py-2">
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => (
              <div
                key={i}
                className="min-h-24 space-y-1 border-b border-r border-border p-1.5 last:border-r-0"
              >
                <Skeleton className="h-3 w-4" />
                {/* A sparse scattering, not a chip in every cell: a full grid
                    would promise a busier month than most are. */}
                {i % 5 === 2 ? <Skeleton className="h-8 w-full rounded-md" /> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-3">
                <Skeleton className="h-6 w-[3px] rounded-full" />
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-9 w-36 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
