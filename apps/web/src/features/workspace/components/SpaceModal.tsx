import { Dialog, DialogContent } from "@nema-io/weave";

import { SpaceModalForm } from "./SpaceModalForm";

interface SpaceModalProps {
  mode: "create" | "rename";
  spaceId?: string;
  spaceName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpaceModal({
  mode,
  spaceId,
  spaceName,
  open,
  onOpenChange,
}: SpaceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <SpaceModalForm
            mode={mode}
            spaceId={spaceId}
            spaceName={spaceName}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
