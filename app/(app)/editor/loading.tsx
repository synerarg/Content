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
          {/*
            The two generation panels the editor opens with, which this
            skeleton never held: the page started with the selects while the
            real screen starts with two cards above them, so everything below
            was dropping ~300px into place on load.
          */}
          {Array.from({ length: 2 }, (_, panel) => (
            <div
              key={panel}
              className="space-y-4 rounded-xl border border-border bg-card p-5"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
          ))}

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

        {/*
          380px, matching PREVIEW_WIDTH in slide-editor.tsx plus the 12px of
          padding the bordered wrapper adds on each side. The old 340 was a
          guess, and a preview column that grows by 64px when it resolves
          shoves the whole editor sideways.
        */}
        <div className="w-full space-y-4 lg:w-[404px]">
          <Skeleton className="h-3 w-24" />
          <SlidePreviewSkeleton />
          {/* The legibility row, then the export button. */}
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </>
  );
}
