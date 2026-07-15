import { DropdownMenuItem } from "@nema-io/weave";
import { Settings } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface SettingsMenuItemProps {
  onClick: () => void;
}

export function SettingsMenuItem({ onClick }: SettingsMenuItemProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenuItem onClick={onClick}>
      <Settings />
      {t("settings.settings")}
    </DropdownMenuItem>
  );
}
