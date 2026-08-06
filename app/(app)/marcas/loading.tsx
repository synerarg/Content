import {
  BrandCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/app-shell/skeletons";

export default function MarcasLoading() {
  return (
    <>
      <PageHeaderSkeleton withAction />
      <div className="grid gap-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-3 md:px-8">
        {Array.from({ length: 3 }, (_, i) => (
          <BrandCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
