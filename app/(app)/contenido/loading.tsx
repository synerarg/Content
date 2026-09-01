import {
  ListRowSkeleton,
  PageHeaderSkeleton,
} from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContenidoLoading() {
  return (
    <>
      <PageHeaderSkeleton withAction />
      <div className="space-y-8 px-6 py-8 md:px-8">
        {/* CreateBatchPanel */}
        <div className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <div className="grid gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <ListRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
