import { Skeleton } from "@nema-io/weave";

const SKELETON_COUNT = 6;
const WIDTHS = ["w-3/4", "w-1/2", "w-5/6", "w-2/3", "w-3/5", "w-4/5"];

export function SessionListSkeleton() {
  return (
    <div className="px-1.5">
      <div className="px-1.5 pb-1 pt-3">
        <Skeleton className="h-3 w-16" />
      </div>

      <div className="flex flex-col gap-0.5">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className="px-2 py-1.5">
            <Skeleton className={`h-4 ${WIDTHS[i]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
