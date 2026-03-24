import { Suspense } from "react";

import { Dialog, DialogContent } from "@nema-io/weave";

import { SettingsForm } from "./SettingsForm";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <Suspense>
            <SettingsForm onOpenChange={onOpenChange} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
