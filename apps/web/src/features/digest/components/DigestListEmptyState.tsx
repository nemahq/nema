import { Text } from "@nema-io/weave";
import { LayoutList } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

// DraftList(legacy intake) 빈 상태와 같은 형태 — 전체 높이 중앙정렬 + 큰 아이콘
// + 한 줄. 아이콘은 사이드바 진입점(DigestNavItem)과 같은 LayoutList를 써서
// "이 화면이 지금 비어 있다"가 아니라 "이 화면 자체"를 가리키게 한다.
export function DigestListEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <LayoutList className="size-12 text-fg-tertiary" strokeWidth={1.5} />
      <Text size="sm" color="tertiary">
        {t("digest.list_empty")}
      </Text>
    </div>
  );
}
