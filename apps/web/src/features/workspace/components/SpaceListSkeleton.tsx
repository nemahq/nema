import { Skeleton } from "@nema-io/weave";

import { LnbRowBox } from "@web/components/layout/LnbRowBox";

const SKELETON_WIDTHS = ["w-2/3", "w-1/2"];
const SKELETON_STAGGER_DELAY_MS = 100;

interface SpaceListSkeletonProps {
  collapsed: boolean;
}

export function SpaceListSkeleton({ collapsed }: SpaceListSkeletonProps) {
  if (collapsed) {
    return (
      <>
        {SKELETON_WIDTHS.map(function renderCollapsedSkeletonRow(_, i) {
          return (
            <div key={i} className="flex justify-center py-1">
              <Skeleton
                className="size-7 rounded-lg"
                style={{ animationDelay: `${i * SKELETON_STAGGER_DELAY_MS}ms` }}
              />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      {SKELETON_WIDTHS.map(function renderSkeletonRow(width, i) {
        return (
          <div key={width} className="px-2 py-px">
            <LnbRowBox className="pl-3">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton
                className={`h-3 rounded-sm ${width}`}
                style={{
                  animationDelay: `${i * SKELETON_STAGGER_DELAY_MS}ms`,
                }}
              />
            </LnbRowBox>
          </div>
        );
      })}
    </>
  );
}
