import { Suspense } from "react";

import { Dialog, DialogContent } from "@nema-io/weave";

import { useProfileSuspenseQuery } from "@web/features/profile/hooks/useProfileSuspenseQuery";

import { SettingsForm } from "./SettingsForm";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SettingsModalContent({
  onOpenChange,
}: Pick<SettingsModalProps, "onOpenChange">) {
  const [profile] = useProfileSuspenseQuery();

  if (!profile) {
    return null;
  }

  return (
    <SettingsForm
      currentContentLanguage={profile.contentLanguage}
      onOpenChange={onOpenChange}
    />
  );
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <Suspense>
            <SettingsModalContent onOpenChange={onOpenChange} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
