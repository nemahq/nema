import { useState } from "react";

import { Avatar, Button } from "@nema-io/weave";

import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

import { AccountDeleteFlow } from "./AccountDeleteFlow";
import { SettingsRow } from "./SettingsRow";

export function AccountSection() {
  const { t } = useTranslation();
  const user = useUser();
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return (
      <AccountDeleteFlow
        userEmail={user.email}
        onBack={() => setDeleting(false)}
      />
    );
  }

  const initial = user.displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg-primary">
          {t("account.profile_title")}
        </h2>
        <p className="text-xs text-fg-tertiary">
          {t("settings.account_subtitle")}
        </p>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatarUrl} fallback={initial} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg-primary">
              {user.displayName}
            </div>
            <div className="truncate text-xs text-fg-tertiary">
              {user.email}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <span className="text-xs font-semibold tracking-wide text-status-error/70 uppercase">
            {t("account.danger_zone_label")}
          </span>
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
