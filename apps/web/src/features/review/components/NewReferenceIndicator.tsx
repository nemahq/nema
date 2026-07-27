import { useTranslation } from "@web/lib/tolgee";

import { NewLabelIndicator } from "./NewLabelIndicator";

// git 스타일 added 표시 — 헤더 워시 폭을 안 줄이려고 flex 형제 대신 absolute로
// 페이지 여백(px-6) 쪽에 얹는다. 이 목록엔 신규/기존이 섞여 있어(기존은
// ReferenceMergeCard가 맡음) 구분이 의미 있다 — "있으면 신규, 없으면 기존"
// 이분법이라 기존 쪽엔 대칭 아이콘을 안 둔다. Digest는 이 목록이 항상 신규뿐이라
// (기존 Digest를 여기서 고치는 경로 자체가 없음) 같은 표시가 정보량이 없어 안 둔다.
// top-3.5는 헤더 워시 상단 패딩(py-2, 8px)+타입 Chip 높이(outline 보더 2px 포함
// 26px) 중앙에 맞춘 값(8+13-size-3.5 절반7=14px) — Chip의 border만큼을 빠뜨리면
// 1px대 오차로 "+"가 살짝 위로 떠 보인다. left는 페이지 좌우 여백
// (ChangesetDetailLayout의 px-6) 안으로 들어가는 값. size-3.5는 Topic·Tag 공용
// 기본값(size-3)보다 한 단계 큰데, 이 카드 레이아웃에서 먼저 자리 잡은 값이라
// 그대로 둔다(Topic·Tag는 이번에 새로 자리잡는 쪽이라 공용 기본값을 그대로 쓴다).
export function NewReferenceIndicator() {
  const { t } = useTranslation();

  return (
    <NewLabelIndicator
      className="absolute top-3.5 left-[-20px] size-3.5"
      label={t("review.reference_new_indicator")}
    />
  );
}
