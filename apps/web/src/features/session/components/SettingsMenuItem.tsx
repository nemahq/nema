import { DropdownMenuItem } from "@nema-io/weave";
import { Settings } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface SettingsMenuItemProps {
  onClick: () => void;
}

export function SettingsMenuItem({ onClick }: SettingsMenuItemProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenuItem
      onClick={onClick}
      className="cursor-pointer data-[highlighted]:bg-surface-raised-hover/75 dark:data-[highlighted]:bg-fg-primary/10"
    >
      <Settings />
      {t("settings.settings")}
    </DropdownMenuItem>
  );
}
