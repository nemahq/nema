import { Skeleton } from "@nema-io/weave";

const SKELETON_TITLE_WIDTHS = ["w-3/4", "w-2/3", "w-1/2"] as const;
const SKELETON_GROUP_ROW_COUNTS = [3, 3] as const;

export function HistoryListSkeleton() {
  return (
    <div className="max-w-3xl space-y-6 px-8 py-6">
      {SKELETON_GROUP_ROW_COUNTS.map((rowCount, groupIdx) => (
        <div key={groupIdx}>
          <div className="flex items-center gap-3 py-2">
            <Skeleton className="h-3 w-10" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-0.5">
            {Array.from({ length: rowCount }, (_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex flex-1 flex-col gap-0.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton
                    className={`h-5 ${
                      SKELETON_TITLE_WIDTHS[
                        rowIdx % SKELETON_TITLE_WIDTHS.length
                      ]
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
