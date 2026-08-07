import { PageHeaderSkeleton } from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/*
  No result rows in this skeleton, deliberately.

  Arriving at /buscar with no query shows an empty state, not a list — so
  drawing three result-shaped bars would promise results to someone who has not
  searched yet, and then take them away. The form is the only thing this route
  is guaranteed to render, so the form is the only thing held open.
*/
export default function BuscarLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-6 px-6 py-8 md:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-52 rounded-md" />
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>

        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </>
  );
}
