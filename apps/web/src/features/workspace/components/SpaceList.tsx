import { Skeleton } from "@nema-io/weave";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { SpaceListItem } from "./SpaceListItem";

const SKELETON_WIDTHS = ["w-2/3", "w-1/2"];

export function SpaceList() {
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading) {
    return (
      <>
        {SKELETON_WIDTHS.map(function renderSkeletonRow(width, i) {
          return (
            <div key={width} className="px-1.5 py-0.5">
              <div className="flex h-9 items-center gap-1.5 rounded-md px-1.5">
                <Skeleton className="size-4 shrink-0 rounded-sm" />
                <Skeleton
                  className={`h-3.5 rounded-sm ${width}`}
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              </div>
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
