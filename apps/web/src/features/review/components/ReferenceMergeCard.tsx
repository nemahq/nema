import type { ReferenceType } from "@nema-io/shared";
import { Badge } from "@nema-io/weave";

import { REFERENCE_TYPE_LABEL } from "@web/features/review/constants";
import type { ReviewCitedReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceMergeCardProps {
  reference: ReviewCitedReference;
  mergeNote: string;
  disabled: boolean;
  onMergeNoteChange: (mergeNote: string) => void;
}

// 레지스트리에 매칭된 기존 Reference — 타입·이름은 읽기 전용(재분류는 이 리뷰 밖의
// 무거운 조작), 엔진이 제안한 병합 설명("바뀔 설명")만 다듬는다. 원본 설명 대비 diff는
// getReview가 현재 body를 안 내려줘 생략(와이어프레임의 "기존 설명" 표시는 후속).
export function ReferenceMergeCard({
  reference,
  mergeNote,
  disabled,
  onMergeNoteChange,
}: ReferenceMergeCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="info">
          {REFERENCE_TYPE_LABEL[reference.type as ReferenceType]}
        </Badge>
        <span className="min-w-0 truncate text-sm font-medium text-fg-primary">
          {reference.title}
        </span>
      </div>
      <label className="flex flex-col gap-1 text-xs text-fg-tertiary">
        {t("review.reference_merge_label")}
        <textarea
          value={mergeNote}
          onChange={(e) => onMergeNoteChange(e.target.value)}
          disabled={disabled}
          rows={3}
          aria-invalid={mergeNote.trim() === ""}
          className="w-full min-w-0 resize-none rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-fg-primary placeholder:text-fg-tertiary focus-visible:border-brand focus-visible:outline-none aria-invalid:border-status-error disabled:opacity-50 dark:focus-visible:border-fg-tertiary/70"
        />
      </label>
    </div>
  );
}
