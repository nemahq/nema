import { useState } from "react";

import { DropdownMenuItem } from "@nema-io/weave";
import { Settings } from "@nema-io/weave/icons";

import { SettingsModal } from "@web/features/settings";
import { useTranslation } from "@web/lib/tolgee";

export function SettingsMenuItem() {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <DropdownMenuItem
        onClick={() => setSettingsOpen(true)}
        className="cursor-pointer data-[highlighted]:bg-surface-raised-hover dark:data-[highlighted]:bg-fg-primary/10"
      >
        <Settings />
        {t("settings.settings")}
      </DropdownMenuItem>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
