import {
  PageHeaderSkeleton,
  SlidePreviewSkeleton,
} from "@/components/app-shell/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/*
  The batch page signs a URL per background before it can render, so this is the
  longest wait in the app and the one most worth holding a shape for.
*/
export default function BatchLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-8 px-6 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-44" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </div>

        {Array.from({ length: 2 }, (_, post) => (
          <section key={post} className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <div className="space-y-2">
                <SlidePreviewSkeleton />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>

              <div className="space-y-6">
                <Skeleton className="h-3 w-56" />
                {Array.from({ length: 3 }, (_, field) => (
                  <div key={field} className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ))}
                <div className="space-y-3 border-t border-border pt-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-28 w-full rounded-md" />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
