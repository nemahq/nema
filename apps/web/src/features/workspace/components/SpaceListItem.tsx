import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { Hash } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";
import { SidebarNavLink } from "@web/components/layout/SidebarNavLink";
import { shouldNavigateHomeAfterSpaceDelete } from "@web/features/workspace/shouldNavigateHomeAfterSpaceDelete";

import { SpaceDeleteDialog } from "./SpaceDeleteDialog";
import { SpaceItemMenu } from "./SpaceItemMenu";
import { SpaceModal } from "./SpaceModal";

const ICON_CLASS = "size-4";

interface SpaceListItemProps {
  spaceId: string;
  spaceName: string;
  isLastSpace: boolean;
}

export function SpaceListItem({
  spaceId,
  spaceName,
  isLastSpace,
}: SpaceListItemProps) {
  const { collapsed } = useSidebar();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (collapsed) {
    return (
      <SidebarNavLink
        icon={<Hash strokeWidth={1.5} className={ICON_CLASS} />}
        label={spaceName}
        to="/space/$spaceId"
        params={{ spaceId }}
      />
    );
  }

  return (
    <div className="group relative flex items-center px-1.5 py-0.5">
      <Link
        to="/space/$spaceId"
        params={{ spaceId }}
        className="flex h-9 w-full items-center gap-1.5 truncate rounded-md px-1.5 pr-8 text-sm font-normal transition-colors duration-fast hover:bg-surface-raised-hover"
        activeProps={{
          className: "bg-surface-raised-hover font-medium",
        }}
      >
        <Hash strokeWidth={1.5} className={ICON_CLASS} />
        {spaceName}
      </Link>

      <SpaceItemMenu
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <SpaceModal
        mode="rename"
        spaceId={spaceId}
        spaceName={spaceName}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <SpaceDeleteDialog
        spaceId={spaceId}
        spaceName={spaceName}
        isLastSpace={isLastSpace}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          // 세션 삭제와 같은 관례: 지금 열려 있던 항목을 지웠을 때만 이동한다.
          const activeSpaceId =
            "spaceId" in params ? params.spaceId : undefined;
          if (shouldNavigateHomeAfterSpaceDelete(spaceId, activeSpaceId)) {
            navigate({ to: "/" });
          }
        }}
      />
    </div>
  );
}
