import { Skeleton } from "@/components/ui/skeleton";

/*
  Loading skeletons for the app's route segments.

  These deliberately mirror the real components' box model — same paddings, same
  border radii, same heights — because a skeleton whose geometry disagrees with
  the content that replaces it produces a visible jump, which reads as slower
  than showing nothing at all.

  Kept in one file rather than colocated with each loading.tsx so the shapes stay
  in step with each other; several routes share the same card and grid metrics.
*/

/**
 * Mirrors PageHeader: h1 (28px) + p (20px) with space-y-1, inside py-5.
 *
 * `actions` is a COUNT, not a boolean, because a header with two buttons and a
 * skeleton with one still jumps — just less. `/marcas/[id]` grew a second
 * button when products landed and the skeleton kept promising none.
 */
export function PageHeaderSkeleton({
  withAction = false,
  actions,
}: {
  withAction?: boolean;
  actions?: number;
}) {
  const count = actions ?? (withAction ? 1 : 0);

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5 md:px-8">
      <div className="space-y-1">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-[28rem] max-w-full" />
      </div>
      {count > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="h-9 w-36 rounded-md" />
          ))}
        </div>
      ) : null}
    </header>
  );
}

/** Mirrors BrandCard: 48px logo tile, name + tagline, a row of palette dots. */
export function BrandCardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
      <Skeleton className="size-12 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="size-5 rounded-full" />
        ))}
      </div>
    </div>
  );
}

/** Mirrors a row in the batch list: title + meta on the left, chips right. */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card glass-card p-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="hidden shrink-0 gap-2 sm:flex">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}

/**
 * A slide preview placeholder.
 *
 * 4:5 is the feed format (1080x1350) and the one the galleries and batch
 * previews default to, so it is the right shape to hold open.
 */
export function SlidePreviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border p-3 ${className ?? ""}`}>
      <Skeleton className="aspect-[4/5] w-full rounded-lg" />
    </div>
  );
}

/** The standard content well: matches the px-6 py-8 md:px-8 used by pages. */
export function ContentWell({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-8 md:px-8">{children}</div>;
}
