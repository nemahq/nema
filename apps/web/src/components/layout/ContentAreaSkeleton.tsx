import { Skeleton } from "@nema-io/weave";

export function ContentAreaSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-surface-card">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-6">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
