import { TextSkeleton } from "@nema-io/weave";

const SKELETON_COUNT = 4;
const WIDTHS = ["w-3/4", "w-1/2", "w-5/6", "w-2/3"];
const SKELETON_STAGGER_DELAY_MS = 100;
const SKELETON_OPACITY_STEP = 0.15;

export function SessionListSkeleton() {
  return (
    <div className="px-1.5">
      <div className="px-1.5 pb-1 pt-3">
        <TextSkeleton size="xs" className="w-14" />
      </div>

      <div className="flex flex-col gap-0.5">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className="rounded-md px-2 py-1.5">
            <TextSkeleton
              size="sm"
              className={WIDTHS[i]}
              style={{
                animationDelay: `${i * SKELETON_STAGGER_DELAY_MS}ms`,
                opacity: 1 - i * SKELETON_OPACITY_STEP,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
