import type { DigestType } from "@nema-io/shared";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import type { ReviewDigest } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CardViewedToggle } from "./CardViewedToggle";
import { DigestCardMenu } from "./DigestCardMenu";
import { DigestTopicPicker } from "./DigestTopicPicker";
import { DigestTypePicker } from "./DigestTypePicker";
import { useEditing } from "./EditingProvider";

interface DigestCardHeaderProps {
  digestIndex: number;
  type: DigestType;
  baseTopics: ReviewDigest["topics"];
  disabled: boolean;
  viewed: boolean;
  sourceActive: boolean;
  onToggleViewed: () => void;
  onViewSource: () => void;
  onChangeType: (next: DigestType) => void;
  onRemove: () => void;
}

export function DigestCardHeader({
  digestIndex,
  type,
  baseTopics,
  disabled,
  viewed,
  sourceActive,
  onToggleViewed,
  onViewSource,
  onChangeType,
  onRemove,
}: DigestCardHeaderProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const topics = useEditing(
    (state) => state.overrides.topicsOverrides.get(digestIndex) ?? baseTopics,
  );
  const viewedFieldId = `digest-${digestIndex}-viewed`;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 상시 노출, Topic 왼쪽 고정 슬롯 — 가변폭 텍스트(Topic) 뒤에 붙으면
            지터가 생겨서 앞에 둔다. */}
        <DigestTypePicker
          type={type}
          disabled={disabled}
          onChangeType={onChangeType}
        />
        <DigestTopicPicker
          topics={topics}
          disabled={disabled}
          onChange={(next) =>
            dispatch({
              type: "digest/setTopics",
              index: digestIndex,
              topics: next,
            })
          }
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* 원문 보기는 리뷰 작업의 핵심(원문 대조)이라 ⋯ 뒤에 숨기지 않는다.
            아이콘이 텍스트 없이 혼자 의미를 전달해야 해서, 이 앱이 이미 "문서"
            의미로 쓰는 FileText를 재사용한다 — Search는 같은 앱에서 "검색
            쿼리"라는 다른 뜻으로 이미 쓰인다. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              shape="circle"
              disabled={disabled}
              aria-label={t("review.digest_view_source_action")}
              onClick={onViewSource}
              className={cn(
                "text-fg-tertiary",
                sourceActive && "bg-fg-primary/10 text-fg-primary",
              )}
            >
              <FileText className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("review.digest_view_source_action")}
          </TooltipContent>
        </Tooltip>
        <CardViewedToggle
          fieldId={viewedFieldId}
          viewed={viewed}
          disabled={disabled}
          onToggleViewed={onToggleViewed}
        />
        <DigestCardMenu disabled={disabled} onRemove={onRemove} />
      </div>
    </div>
  );
}
