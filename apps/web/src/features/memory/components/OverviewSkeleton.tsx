import { Skeleton } from "@nema-io/weave";

const SECTION_CHIP_COUNTS = [6, 5, 4, 3];
const CHIP_WIDTHS = ["w-20", "w-28", "w-16", "w-24", "w-32", "w-20"];
const STAGGER_SLOT_SIZE = 6;
const ANIMATION_STAGGER_MS = 60;
const OPACITY_DECAY_PER_STEP = 0.03;

export function OverviewSkeleton() {
  return (
    <>
      <div className="flex min-h-12 items-center border-b border-border/50 px-6">
        <Skeleton className="h-5 w-28 rounded-sm" />
      </div>
      <div className="flex-1 overflow-hidden px-8 py-6">
        {SECTION_CHIP_COUNTS.map((chipCount, sectionIdx) => (
          <div key={sectionIdx} className="mb-8">
            <div className="mb-3.5 flex items-center gap-2">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-sm" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: chipCount }).map((_, chipIdx) => {
                const step = sectionIdx * STAGGER_SLOT_SIZE + chipIdx;
                return (
                  <Skeleton
                    key={chipIdx}
                    className={`h-[34px] ${CHIP_WIDTHS[chipIdx % CHIP_WIDTHS.length]} rounded-[10px]`}
                    style={{
                      animationDelay: `${step * ANIMATION_STAGGER_MS}ms`,
                      opacity: 1 - step * OPACITY_DECAY_PER_STEP,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
