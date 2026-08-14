import { Text } from "@nema-io/weave";
import { PackageOpen } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

// DraftList(legacy intake) 빈 상태와 같은 형태 — 전체 높이 중앙정렬 + 큰 아이콘
// + 한 줄. 사이드바 진입점(DigestNavItem)의 Package(닫힌 상자)와 짝을 이루는
// PackageOpen(열린 상자)을 써서 "아직 정리된 게 하나도 안 쌓였다"는 상태
// 자체를 가리킨다.
export function DigestListEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <PackageOpen className="size-12 text-fg-tertiary" strokeWidth={1.5} />
      <Text size="sm" color="tertiary">
        {t("digest.list_empty")}
      </Text>
    </div>
  );
}
