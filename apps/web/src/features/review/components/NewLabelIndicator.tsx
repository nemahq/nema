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
// 남겨둬야 한다. 기본 크기는 칩 제거(×) 아이콘(size-3)과 맞춰 그 이상 강조하지
// 않는다 — 소비처가 자기 레이아웃에 맞춰 className으로만 덮어쓴다(twMerge라 마지막
// 값이 이긴다).
export function NewLabelIndicator({
  className,
  label,
}: NewLabelIndicatorProps) {
  const { t } = useTranslation();

  return (
    <>
      <Plus
        aria-hidden="true"
        className={cn("size-3 text-brand-accent", className)}
      />
      {/* weave sr-only(position:absolute)를 안 쓰는 이유 — 이 표식은 스크롤되는 긴
          목록(Digest 카드마다) 안에서 반복 렌더된다. absolute + 오프셋 미지정은
          "정적 위치"를 문서 좌표계로 계산하는데, 가까운 위치 조상이 없으면(Reference의
          카드 헤더처럼 relative를 둬도 마찬가지로 재현됨) 그 값이 그대로 <html>의
          scrollHeight에 잡혀 리뷰 화면 전체에 이중 스크롤이 생긴다(실측 확인:
          해당 span들을 지우면 documentElement.scrollHeight가 그만큼 정확히 줄어듦).
          position을 그대로 두고 1px 크기+overflow:hidden만으로 같은 시각적 결과를
          낸다. */}
      <span className="inline-block size-px overflow-hidden whitespace-nowrap">
        {label ?? t("review.label_new_indicator")}
      </span>
    </>
  );
}
