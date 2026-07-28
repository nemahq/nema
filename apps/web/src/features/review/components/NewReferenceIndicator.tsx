import { useTranslation } from "@web/lib/tolgee";

import { NewLabelIndicator } from "./NewLabelIndicator";

// git 스타일 added 표시 — 헤더 워시 폭을 안 줄이려고 flex 형제 대신 absolute로
// 페이지 여백(px-6) 쪽에 얹는다. 이 목록엔 신규/기존이 섞여 있어(기존은
// ReferenceMergeCard가 맡음) 구분이 의미 있다 — "있으면 신규, 없으면 기존"
// 이분법이라 기존 쪽엔 대칭 아이콘을 안 둔다. Digest는 이 목록이 항상 신규뿐이라
// (기존 Digest를 여기서 고치는 경로 자체가 없음) 같은 표시가 정보량이 없어 안 둔다.
// top-1/2 -translate-y-1/2는 ReferenceCardHeader의 타입 Chip 행(relative) 기준
// 세로 중앙 — 렌더링 부모는 ReferenceCardHeader.tsx에서 정한다. left는 페이지
// 좌우 여백(ChangesetDetailLayout의 px-6) 안으로 들어가는 값. size-3.5는 이 카드
// 레이아웃에 맞춘 값 — Topic·Tag 공용 기본값(size-3)과 다르다.
export function NewReferenceIndicator() {
  const { t } = useTranslation();

  return (
    <NewLabelIndicator
      className="absolute top-1/2 left-[-24px] size-3.5 -translate-y-1/2"
      label={t("review.reference_new_indicator")}
    />
  );
}
