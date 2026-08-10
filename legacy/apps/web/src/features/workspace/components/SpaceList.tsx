import { Suspense } from "react";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useSpaceListSuspenseQuery } from "@web/hooks/useSpaceList";

import { SpaceListItem } from "./SpaceListItem";
import { SpaceListSkeleton } from "./SpaceListSkeleton";

function SpaceListInner() {
  const [spaceList] = useSpaceListSuspenseQuery();
  const spaces = spaceList.spaces;

  return (
    <>
      {spaces.map((space) => (
        <SpaceListItem
          key={space.id}
          spaceId={space.id}
          spacePublicId={space.publicId}
          spaceName={space.name}
          isLastSpace={spaces.length <= 1}
          openChangesetCount={space.openChangesetCount}
        />
      ))}
    </>
  );
}

export function SpaceList() {
  const { collapsed } = useSidebar();

  return (
    <Suspense fallback={<SpaceListSkeleton collapsed={collapsed} />}>
      <SpaceListInner />
    </Suspense>
  );
}
