import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import { Hash } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
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
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <NavItem
        icon={<Hash strokeWidth={1.5} className={ICON_CLASS} />}
        label={spaceName}
        to="/space/$spaceId"
        params={{ spaceId }}
        trailingAction={
          <SpaceItemMenu
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        }
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
    </>
  );
}
