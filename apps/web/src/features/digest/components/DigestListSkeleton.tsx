import { Skeleton, TextSkeleton } from "@nema-io/weave";

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
          <TextSkeleton size="base" className="w-2/3" />
          <TextSkeleton size="sm" className="w-full" />
        </div>
      ))}
    </>
  );
}
