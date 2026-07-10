import { Skeleton } from "@nema-io/weave";
import { Hash } from "@nema-io/weave/icons";

import { SidebarNavLink } from "@web/components/layout/SidebarNavLink";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

const ICON_CLASS = "size-4";

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

  return (
    <>
      {(bootstrap?.spaces ?? []).map(function renderSpaceLink(space) {
        return (
          <SidebarNavLink
            key={space.id}
            icon={<Hash strokeWidth={1.5} className={ICON_CLASS} />}
            label={space.name}
            to="/space/$spaceId"
            params={{ spaceId: space.id }}
          />
        );
      })}
    </>
  );
}
