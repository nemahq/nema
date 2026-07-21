import { Skeleton } from "@nema-io/weave";

import { REFERENCE_TABLE_GRID_CLASSNAME } from "./referenceTableLayout";

const SKELETON_ROW_COUNT = 6;

export function ReferenceTableSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
        <div
          key={index}
          className={`${REFERENCE_TABLE_GRID_CLASSNAME} items-center px-3 py-1`}
        >
          <Skeleton className="h-5 w-14 rounded-[4px]" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
