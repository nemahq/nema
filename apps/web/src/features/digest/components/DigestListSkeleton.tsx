import { Skeleton } from "@nema-io/weave";

const SKELETON_ROW_COUNT = 6;

export function DigestListSkeleton() {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-4"
        >
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </>
  );
}
