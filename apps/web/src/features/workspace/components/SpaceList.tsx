import { Skeleton } from "@nema-io/weave";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { SpaceListItem } from "./SpaceListItem";

export function SpaceList() {
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-1.5 py-0.5">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }

  const spaces = bootstrap?.spaces ?? [];

  return (
    <>
      {spaces.map((space) => (
        <SpaceListItem
          key={space.id}
          space={space}
          isLastSpace={spaces.length <= 1}
        />
      ))}
    </>
  );
}
