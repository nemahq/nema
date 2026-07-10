import { Dialog, DialogContent } from "@nema-io/weave";

import { SpaceDeleteBlockedForm } from "./SpaceDeleteBlockedForm";
import { SpaceDeleteConfirmForm } from "./SpaceDeleteConfirmForm";

interface SpaceDeleteDialogProps {
  spaceId: string;
  spaceName: string;
  isLastSpace: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function SpaceDeleteDialog({
  spaceId,
  spaceName,
  isLastSpace,
  open,
  onOpenChange,
  onDeleted,
}: SpaceDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        {/* 메뉴 항목을 disabled로 막으면 hover 툴팁도 같이 죽어 이유를 못 보여준다 —
            그래서 항상 열되 마지막 Space일 땐 확인 없는 차단 안내로 대체한다. */}
        {open &&
          (isLastSpace ? (
            <SpaceDeleteBlockedForm onOpenChange={onOpenChange} />
          ) : (
            <SpaceDeleteConfirmForm
              spaceId={spaceId}
              spaceName={spaceName}
              onOpenChange={onOpenChange}
              onDeleted={onDeleted}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
