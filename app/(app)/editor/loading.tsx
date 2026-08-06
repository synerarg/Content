import {
  PageHeaderSkeleton,
  SlidePreviewSkeleton,
} from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditorLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>

          <Skeleton className="h-4 w-72 max-w-full" />

          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-[340px]">
          <Skeleton className="h-3 w-24" />
          <SlidePreviewSkeleton />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </>
  );
}
