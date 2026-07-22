import { useId, useState } from "react";

import { REFERENCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Badge, cn, Text } from "@nema-io/weave";
import { Triangle } from "@nema-io/weave/icons";

import {
  isReferenceType,
  REFERENCE_TYPE_LABEL,
} from "@web/features/review/constants";
import type { ReviewCitedReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CardViewedToggle } from "./CardViewedToggle";
import { DigestTextField } from "./DigestTextField";
import { ReferenceMergeCardMenu } from "./ReferenceMergeCardMenu";
import { ReferenceMergeDiff } from "./ReferenceMergeDiff";

interface ReferenceMergeCardProps {
  reference: ReviewCitedReference;
  mergeNote: string;
  disabled: boolean;
  onMergeNoteChange: (mergeNote: string) => void;
}

// 타입·이름은 재분류가 review-flow 밖의 무거운 조작이라 읽기 전용(정적 Badge).
// "원래대로"는 RPC의 before===after no-op으로 병합을 거부하는 것이라 메뉴 뒤에.
// diff는 엔진의 원래 제안(reference.mergeNote)과 body를 비교한다 — 편집 필드의
// 실시간 값과 비교하면 사용자가 고칠 때마다 "뭐가 AI 제안이었는지"가 흔들린다.
export function ReferenceMergeCard({
  reference,
  mergeNote,
  disabled,
  onMergeNoteChange,
}: ReferenceMergeCardProps) {
  const [viewed, setViewed] = useState(false);
  const [diffExpanded, setDiffExpanded] = useState(false);
  const { t } = useTranslation();
  const isOriginal = mergeNote === reference.body;
  const aiProposedNote = reference.mergeNote ?? reference.body;
  const hasProposedChange = aiProposedNote !== reference.body;
  const viewedFieldId = `reference-merge-${reference.id}-viewed`;
  const diffContentId = useId();

  return (
    <div className={cn("flex flex-col gap-2", viewed ? "pb-4" : "pb-8")}>
      <div className="flex flex-col gap-2 bg-fg-primary/5 px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          {/* ReferenceTypePicker(Chip)와 같은 자리 — 정적/인터랙티브 버전이 크기·
              모양이 같아야 해서 shape="pill"로 맞춘다(Badge 기본은 각진
              rounded-[4px]). 글자색(Badge outline은 text-fg-primary, Chip outline은
              text-fg-tertiary)은 아직 안 맞다 — Badge outline이 이 앱 전역
              4곳에 걸려 있어 다른 세션에서 별도로 정리하기로 함. */}
          <Badge variant="outline" shape="pill">
            {isReferenceType(reference.type)
              ? REFERENCE_TYPE_LABEL[reference.type]
              : reference.type}
          </Badge>
          <div className="flex shrink-0 items-center gap-2">
            <CardViewedToggle
              fieldId={viewedFieldId}
              viewed={viewed}
              disabled={disabled}
              onToggleViewed={() => setViewed((current) => !current)}
            />
            <ReferenceMergeCardMenu
              disabled={disabled || isOriginal}
              onRestore={() => onMergeNoteChange(reference.body)}
            />
          </div>
        </div>
        <Text
          size="xl"
          weight="semibold"
          title={reference.title}
          className="min-w-0 truncate"
        >
          {reference.title}
        </Text>
      </div>

      {!viewed && (
        <div className="mt-2 flex flex-col gap-3 pl-2">
          <div className="flex flex-col gap-1">
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t("review.reference_body_label")}
            </Text>
            <DigestTextField
              text={mergeNote}
              disabled={disabled}
              maxLength={REFERENCE_BODY_MAX_LENGTH}
              placeholder={t("review.reference_body_placeholder")}
              onChange={onMergeNoteChange}
            />
          </div>
          {hasProposedChange && (
            <div className="flex flex-col gap-1">
              {/* weave Button 대신 raw — DraftSection의 접기/펼치기 트리거와 같은
                  이유: 아이콘+Text 조합이 주변 타이포를 그대로 상속해야 해서
                  Button의 강제 text-[13px] font-semibold와 안 맞는다. */}
              <button
                type="button"
                onClick={() => setDiffExpanded((current) => !current)}
                aria-expanded={diffExpanded}
                aria-controls={diffContentId}
                className="group flex w-fit items-center gap-1.5"
              >
                <Triangle
                  className={cn(
                    "size-1.5 shrink-0 fill-current text-fg-tertiary/50 transition-transform duration-fast group-hover:text-fg-primary",
                    diffExpanded ? "rotate-180" : "rotate-90",
                  )}
                />
                <Text
                  as="span"
                  size="sm"
                  weight="medium"
                  color="tertiary"
                  className="group-hover:text-fg-primary"
                >
                  {t("review.reference_merge_diff_toggle_label")}
                </Text>
              </button>
              {diffExpanded && (
                <div id={diffContentId}>
                  <ReferenceMergeDiff
                    original={reference.body}
                    revised={aiProposedNote}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
