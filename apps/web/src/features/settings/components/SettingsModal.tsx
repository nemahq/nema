import { useState } from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

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
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 md:max-w-3xl"
      >
        <DialogTitle className="sr-only">{t("settings.settings")}</DialogTitle>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogClose asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("common.close")}
                className="absolute top-4 right-4 size-7 text-fg-tertiary"
              >
                <X className="size-5" />
              </Button>
            </DialogClose>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("common.close")}</TooltipContent>
        </Tooltip>
        <div className="flex h-[560px]">
          <SettingsNav section={section} onSectionChange={setSection} />
          <div className="flex-1 overflow-y-auto p-6 dark:bg-surface-base">
            {open && section === "preferences" && <PreferencesSection />}
            {open && section === "account" && <AccountSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
