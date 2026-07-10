import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { Hash } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";
import { SidebarNavLink } from "@web/components/layout/SidebarNavLink";

import { SpaceDeleteDialog } from "./SpaceDeleteDialog";
import { SpaceItemMenu } from "./SpaceItemMenu";
import { SpaceModal } from "./SpaceModal";

const ICON_CLASS = "size-4";

interface SpaceListItemProps {
  space: { id: string; name: string };
  isLastSpace: boolean;
}

export function SpaceListItem({ space, isLastSpace }: SpaceListItemProps) {
  const { collapsed } = useSidebar();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (collapsed) {
    return (
      <SidebarNavLink
        icon={<Hash strokeWidth={1.5} className={ICON_CLASS} />}
        label={space.name}
        to="/space/$spaceId"
        params={{ spaceId: space.id }}
      />
    );
  }

  return (
    <div className="group relative flex items-center px-1.5 py-0.5">
      <Link
        to="/space/$spaceId"
        params={{ spaceId: space.id }}
        className="flex h-9 w-full items-center gap-1.5 truncate rounded-md px-1.5 pr-8 text-sm font-normal transition-colors duration-fast hover:bg-surface-raised-hover"
        activeProps={{
          className: "bg-surface-raised-hover font-medium",
        }}
      >
        <Hash strokeWidth={1.5} className={ICON_CLASS} />
        {space.name}
      </Link>

      <SpaceItemMenu
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <SpaceModal
        mode="rename"
        space={space}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <SpaceDeleteDialog
        space={space}
        isLastSpace={isLastSpace}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          if ("spaceId" in params && params.spaceId === space.id) {
            navigate({ to: "/" });
          }
        }}
      />
    </div>
  );
}
