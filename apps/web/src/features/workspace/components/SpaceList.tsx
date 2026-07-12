import { Skeleton } from "@nema-io/weave";

import { LnbRowBox } from "@web/components/layout/LnbRowBox";
import { useSidebar } from "@web/components/layout/Sidebar";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { SpaceListItem } from "./SpaceListItem";

const SKELETON_WIDTHS = ["w-2/3", "w-1/2"];
const SKELETON_STAGGER_DELAY_MS = 100;

export function SpaceList() {
  const { collapsed } = useSidebar();
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading && collapsed) {
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

  if (isLoading) {
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

  const spaces = bootstrap?.spaces ?? [];

  return (
    <>
      {spaces.map((space) => (
        <SpaceListItem
          key={space.id}
          spaceId={space.id}
          spaceName={space.name}
          isLastSpace={spaces.length <= 1}
        />
      ))}
    </>
  );
}
