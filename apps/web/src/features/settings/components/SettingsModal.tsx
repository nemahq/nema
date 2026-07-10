import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import { AccountSection } from "./AccountSection";
import { PreferencesSection } from "./PreferencesSection";
import { SettingsNav, type SettingsSection } from "./SettingsNav";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("preferences");

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // 다시 열 때는 항상 "Preferences" 섹션부터 보여야 한다(surface-inventory
      // "일반" 섹션 — 이름은 Preferences로 바뀌었지만 기본 진입 섹션 규칙은 그대로).
      setSection("preferences");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 md:max-w-3xl">
        <DialogTitle className="sr-only">{t("settings.settings")}</DialogTitle>
        <div className="flex h-[560px]">
          <SettingsNav section={section} onSectionChange={setSection} />
          <div className="flex-1 overflow-y-auto p-6">
            {open && section === "preferences" && (
              <PreferencesSection onOpenChange={onOpenChange} />
            )}
            {open && section === "account" && <AccountSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
