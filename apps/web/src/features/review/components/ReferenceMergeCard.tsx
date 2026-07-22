import { REFERENCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Badge, Button, Text, Textarea } from "@nema-io/weave";
import { Undo2 } from "@nema-io/weave/icons";

import {
  isReferenceType,
  REFERENCE_TYPE_LABEL,
} from "@web/features/review/constants";
import type { ReviewCitedReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceMergeCardProps {
  reference: ReviewCitedReference;
  mergeNote: string;
  disabled: boolean;
  onMergeNoteChange: (mergeNote: string) => void;
}

// 레지스트리에 매칭된 기존 Reference — 타입·이름은 읽기 전용(재분류는 이 리뷰 밖의
// 무거운 조작), 엔진이 제안한 병합 설명("바뀔 설명")만 다듬는다. "원래대로"는 편집값을
// 원본 body로 되돌려 병합을 거부하는 수단이다(RPC에서 before===after면 no-op).
export function ReferenceMergeCard({
  reference,
  mergeNote,
  disabled,
  onMergeNoteChange,
}: ReferenceMergeCardProps) {
  const { t } = useTranslation();
  const isOriginal = mergeNote === reference.body;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge variant="info">
            {isReferenceType(reference.type)
              ? REFERENCE_TYPE_LABEL[reference.type]
              : reference.type}
          </Badge>
          <Text
            as="span"
            size="sm"
            weight="medium"
            className="min-w-0 truncate"
          >
            {reference.title}
          </Text>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={disabled || isOriginal}
          aria-label={t("review.reference_merge_restore_action")}
          onClick={() => onMergeNoteChange(reference.body)}
        >
          <Undo2 />
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Text as="span" size="xs" color="tertiary">
          {t("review.reference_merge_original_label")}
        </Text>
        <Text
          size="sm"
          color="secondary"
          className="rounded-md bg-surface-card px-3 py-1.5"
        >
          {reference.body}
        </Text>
      </div>
      <Text
        as="label"
        size="xs"
        color="tertiary"
        className="flex flex-col gap-1"
      >
        {t("review.reference_merge_label")}
        <Textarea
          value={mergeNote}
          onChange={(e) => onMergeNoteChange(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={REFERENCE_BODY_MAX_LENGTH}
          aria-invalid={mergeNote.trim() === ""}
        />
      </Text>
    </div>
  );
}
