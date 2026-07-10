import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import { AccountSection } from "./AccountSection";
import { GeneralSection } from "./GeneralSection";
import { SettingsNav, type SettingsSection } from "./SettingsNav";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("general");

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // 다시 열 때는 항상 "일반" 섹션부터 보여야 한다(surface-inventory).
      setSection("general");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 md:max-w-2xl">
        <DialogTitle className="sr-only">{t("settings.settings")}</DialogTitle>
        <div className="flex h-[520px]">
          <SettingsNav section={section} onSectionChange={setSection} />
          <div className="flex-1 overflow-y-auto p-6">
            {open && section === "general" && (
              <GeneralSection onOpenChange={onOpenChange} />
            )}
            {open && section === "account" && <AccountSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
