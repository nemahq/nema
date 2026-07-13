import { Dialog, DialogContent } from "@nema-io/weave";

import { SpaceCreateForm } from "./SpaceCreateForm";

interface SpaceCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpaceCreateModal({
  open,
  onOpenChange,
}: SpaceCreateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {open && <SpaceCreateForm onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
