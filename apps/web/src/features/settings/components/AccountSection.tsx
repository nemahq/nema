import { useState } from "react";

import { Avatar, Button, Text } from "@nema-io/weave";

import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

import { AccountDeleteFlow } from "./AccountDeleteFlow";
import { SettingsRow } from "./SettingsRow";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

export function AccountSection() {
  const { t } = useTranslation();
  const user = useUser();
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return <AccountDeleteFlow onBack={() => setDeleting(false)} />;
  }

  const initial = user.displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <Text as="h2" size="xl" weight="semibold">
          {t("account.profile_title")}
        </Text>
        <Text size="base" color="tertiary">
          {t("settings.account_subtitle")}
        </Text>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <SettingsSectionHeader label={t("settings.account_section")} />
          <div className="flex items-center gap-3 pt-4">
            <Avatar src={user.avatarUrl} fallback={initial} />
            <div className="min-w-0">
              <Text as="div" size="base" weight="medium" className="truncate">
                {user.displayName}
              </Text>
              <Text as="div" size="sm" color="tertiary" className="truncate">
                {user.email}
              </Text>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SettingsSectionHeader label={t("account.support_label")} />
          <SettingsRow
            label={t("account.delete_title")}
            description={t("account.delete_description")}
          >
            <Button variant="danger" onClick={() => setDeleting(true)}>
              {t("account.delete_button")}
            </Button>
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}
