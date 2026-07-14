import { NavigationBar } from "@web/components/layout/NavigationBar";
import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { useTranslation } from "@web/lib/tolgee";

import { DraftList } from "./DraftList";

export function DraftsScreen() {
  const { t } = useTranslation();
  const pendingQuery = usePendingSourceListQuery();

  // 이 페이지의 주축 데이터(초안 목록)가 뜨기 전엔 헤더까지 다 숨기고 워터마크만 —
  // 로딩이 끝나는 순간 헤더 포함 실제 페이지로 곧장 전환된다.
  if (pendingQuery.isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-surface-card">
        <LoadingWatermark />
      </main>
    );
  }

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
