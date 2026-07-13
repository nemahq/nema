import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import { NavItem } from "@web/components/layout/NavItem";
import { shouldNavigateHomeAfterSpaceDelete } from "@web/features/workspace/shouldNavigateHomeAfterSpaceDelete";

import { SpaceDeleteDialog } from "./SpaceDeleteDialog";
import { SpaceItemMenu } from "./SpaceItemMenu";
import { SpaceSettingsModal } from "./SpaceSettingsModal";

// 색상 배지는 리스트에서 시각적으로 시끄러워 중립 톤으로 회귀(design-decisions-log.md
// "Space 아이콘 — 색상 실험 후 중립으로 회귀" 참고) — 테마별로 자동 조정되는 중립 tint.
const BADGE_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded-md bg-fg-primary/10 text-[10px] font-medium text-fg-primary";

interface SpaceListItemProps {
  spaceId: string;
  spacePublicId: string;
  spaceName: string;
  isLastSpace: boolean;
}

export function SpaceListItem({
  spaceId,
  spacePublicId,
  spaceName,
  isLastSpace,
}: SpaceListItemProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <NavItem
        icon={
          <span className={BADGE_CLASS}>
            {spaceName.charAt(0).toUpperCase()}
          </span>
        }
        label={spaceName}
        to="/space/$spacePublicId"
        params={{ spacePublicId }}
        trailingAction={
          <SpaceItemMenu
            onOpenSettings={() => setSettingsOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        }
      />

      <SpaceSettingsModal
        spaceId={spaceId}
        spaceName={spaceName}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <SpaceDeleteDialog
        spaceId={spaceId}
        spaceName={spaceName}
        isLastSpace={isLastSpace}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          // 세션 삭제와 같은 관례: 지금 열려 있던 항목을 지웠을 때만 이동한다.
          const activeSpacePublicId =
            "spacePublicId" in params ? params.spacePublicId : undefined;
          if (
            shouldNavigateHomeAfterSpaceDelete(
              spacePublicId,
              activeSpacePublicId,
            )
          ) {
            navigate({ to: "/" });
          }
        }}
      />
    </>
  );
}
