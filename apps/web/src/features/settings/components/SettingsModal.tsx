import type { ContentLanguage } from "@nema-io/shared";
import { Dialog, DialogContent } from "@nema-io/weave";

import { SettingsForm } from "./SettingsForm";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContentLanguage: ContentLanguage;
}

export function SettingsModal({
  open,
  onOpenChange,
  currentContentLanguage,
}: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <SettingsForm
            currentContentLanguage={currentContentLanguage}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
