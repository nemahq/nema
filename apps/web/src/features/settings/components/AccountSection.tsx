import { useState } from "react";

import { Avatar, Button } from "@nema-io/weave";

import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

import { AccountDeleteFlow } from "./AccountDeleteFlow";

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
      <h2 className="text-base font-semibold text-fg-primary">
        {t("settings.nav_account")}
      </h2>

      <div className="mt-5 flex items-center gap-3">
        <Avatar src={user.avatarUrl} fallback={initial} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg-primary">
            {user.displayName}
          </div>
          <div className="truncate text-xs text-fg-tertiary">{user.email}</div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6">
        <span className="text-sm font-medium text-fg-primary">
          {t("account.delete_title")}
        </span>
        <p className="text-xs text-fg-tertiary">
          {t("account.delete_description")}
        </p>
        <Button
          variant="danger"
          className="self-start"
          onClick={() => setDeleting(true)}
        >
          {t("account.delete_button")}
        </Button>
      </div>
    </div>
  );
}
