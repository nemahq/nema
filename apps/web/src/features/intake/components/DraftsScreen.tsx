import { NavigationBar } from "@web/components/layout/NavigationBar";
import { useTranslation } from "@web/lib/tolgee";

import { DraftList } from "./DraftList";

export function DraftsScreen() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <NavigationBar>
        <h1 className="text-sm font-medium text-fg-primary">
          {t("intake.drafts_title")}
        </h1>
      </NavigationBar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-8">
          <DraftList />
        </div>
      </div>
    </main>
  );
}
