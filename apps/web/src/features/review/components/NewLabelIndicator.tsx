import { cn } from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface NewLabelIndicatorProps {
  className?: string;
  // Reference는 자기 자리에 맞는 기존 문구(위키에 새로 추가될 레퍼런스)가 이미
  // 있어 그걸 그대로 쓴다 — 공유하는 건 아이콘·색·크기 규칙뿐, 스크린리더 문구는
  // 개체마다 뜻이 달라 강제로 통일하지 않는다.
  label?: string;
}

// Topic·Tag·Reference 세 개체가 공유하는 "신규" 표식 — 원·점 배경 없이 "+" 글자만
// 쓴다(원+아이콘 조합은 "누르면 추가되는 버튼"으로 오인될 위험이 있어 기각). 색은
// text-status-success(초록)를 피한다 — 초록은 "확정·완료"로 읽혀 "아직 확정 전이니
// 주의해서 보라"는 의도와 반대로 읽히고, 나중에 "저장 성공"에 초록을 쓸 자리를
// 남겨둬야 한다. 소비처가 자기 레이아웃에 맞춰 className으로만 덮어쓴다(twMerge라
// 마지막 값이 이긴다).
//
// 스크린리더 문구는 별도 sr-only span이 아니라 아이콘 자신의 role="img" +
// aria-label로 준다 — 이 표식은 스크롤되는 긴 목록(Digest 카드마다) 안에서
// 반복 렌더되는데, 별개 DOM 노드를 두면 그 노드의 위치 계산이 페이지 전체
// 스크롤 영역에 잘못 끼어들 여지가 생긴다(absolute 배치 조합에서 실제로
// 겪음). 아이콘 하나로 합치면 그 여지 자체가 없다.
export function NewLabelIndicator({
  className,
  label,
}: NewLabelIndicatorProps) {
  const { t } = useTranslation();

  return (
    <Plus
      role="img"
      aria-label={label ?? t("review.label_new_indicator")}
      strokeWidth={2}
      className={cn("size-3.5 text-brand-accent", className)}
    />
  );
}
