import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

// ingestion/relation(충돌·중복 판정) 되돌리기가 여는 open 재판정 초안은 실제
// 화면(Digest 리뷰·관계 판정 재사용)이 아직 없다 — 그 화면이 붙기 전까지 이
// 자리를 대신한다. throw하지 않는다: 이 상태는 데이터 정합성이 깨진 게 아니라
// 정상적으로 도달 가능한, 아직 못 그리는 화면일 뿐이다.
export function ChangesetReopenPending() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <Text as="h1" size="lg" weight="semibold">
        {t("review.detail_pending_reopen_title")}
      </Text>
      <Text size="sm" color="tertiary">
        {t("review.detail_pending_reopen_body")}
      </Text>
    </div>
  );
}
