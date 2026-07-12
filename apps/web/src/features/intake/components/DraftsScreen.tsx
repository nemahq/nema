import { useTranslation } from "@web/lib/tolgee";

import { DraftList } from "./DraftList";

export function DraftsScreen() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="text-xl font-semibold text-fg-primary">
          {t("intake.drafts_title")}
        </h1>

        <DraftList />
      </div>
    </main>
  );
}
