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
      <DialogContent>
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
