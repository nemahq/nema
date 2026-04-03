import { useTranslation } from "@web/lib/tolgee";

import { MemoryEmptyState } from "./MemoryEmptyState";

export function MemoryPage() {
  const { t } = useTranslation();

  // TODO: entity list API 연동 후 빈 상태 분기
  const isEmpty = true;

  if (isEmpty) {
    return <MemoryEmptyState />;
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <div className="mx-auto w-full max-w-2xl px-6 pt-8">
        <h1 className="text-lg font-medium text-fg-primary">
          {t("memory.sidebar_label")}
        </h1>
      </div>
    </main>
  );
}
