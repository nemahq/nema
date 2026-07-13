import { Dialog, DialogContent } from "@nema-io/weave";

import { SpaceSettingsForm } from "./SpaceSettingsForm";

interface SpaceSettingsModalProps {
  spaceId: string;
  spaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpaceSettingsModal({
  spaceId,
  spaceName,
  open,
  onOpenChange,
}: SpaceSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {open && (
          <SpaceSettingsForm
            spaceId={spaceId}
            spaceName={spaceName}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
