import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { UserMenu } from "./UserMenu";

export function SessionPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh">
      <Sidebar footer={(collapsed) => <UserMenu collapsed={collapsed} />} />

      <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
        <p className="text-fg-tertiary">{t("session.empty")}</p>
      </main>
    </div>
  );
}
