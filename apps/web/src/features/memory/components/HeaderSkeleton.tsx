import { Skeleton } from "@nema-io/weave";

export function HeaderSkeleton() {
  return (
    <div className="flex min-h-12 items-center border-b border-border/50 px-6">
      <Skeleton className="h-5 w-28 rounded-sm" />
    </div>
  );
}
