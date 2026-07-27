import { Plus } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface NewLabelMarkProps {
  className?: string;
}

// Topic·Tag 칩/배지에 붙는 "신규" 표식 — Reference의 NewReferenceIndicator와
// 같은 원리(있으면 신규, 없으면 기존)지만, 칩·배지 안에 인라인으로 들어가는
// 자리라 절대위치 대신 형제 아이콘으로 둔다. 색은 success가 아니라 brand —
// 신규 라벨은 아직 확정 전이라 "성공/완료"로 읽히면 안 된다.
export function NewLabelMark({ className }: NewLabelMarkProps) {
  const { t } = useTranslation();

  return (
    <>
      <Plus
        aria-hidden="true"
        className={className ?? "size-3 shrink-0 text-brand-accent"}
      />
      <span className="sr-only">{t("review.label_new_indicator")}</span>
    </>
  );
}
