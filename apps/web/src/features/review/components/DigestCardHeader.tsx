import type { DigestType } from "@nema-io/shared";
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import {
  DIGEST_TYPE_BADGE_VARIANT,
  DIGEST_TYPE_LABEL_KEY,
} from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCardMenu } from "./DigestCardMenu";
import { DigestTopicPicker } from "./DigestTopicPicker";

interface DigestCardHeaderProps {
  digestIndex: number;
  type: DigestType;
  topics: ReviewDigest["topics"];
  disabled: boolean;
  viewed: boolean;
  sourceActive: boolean;
  onToggleViewed: () => void;
  onViewSource: () => void;
  onChangeTopics: (next: ReviewDigest["topics"]) => void;
  onChangeType: (next: DigestType) => void;
  onRemove: () => void;
}

export function DigestCardHeader({
  digestIndex,
  type,
  topics,
  disabled,
  viewed,
  sourceActive,
  onToggleViewed,
  onViewSource,
  onChangeTopics,
  onChangeType,
  onRemove,
}: DigestCardHeaderProps) {
  const { t } = useTranslation();
  const viewedFieldId = `digest-${digestIndex}-viewed`;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 펼친 상태에선 타입별 전용 필드가 이미 타입을 드러내므로 배지를 안 낸다.
            접히면 그 단서가 사라져서 이때만 읽기 전용 배지로 되살린다 — 편집은
            여전히 ⋯ 메뉴 전담이라 클릭 가능한 Chip이 아니다. Topic 왼쪽에 두는
            건 가변폭 텍스트 뒤에 붙으면 지터가 생기기 때문. */}
        {viewed && (
          <Badge
            variant={DIGEST_TYPE_BADGE_VARIANT[type]}
            shape="rounded"
            className="shrink-0"
          >
            {t(DIGEST_TYPE_LABEL_KEY[type])}
          </Badge>
        )}
        <DigestTopicPicker
          topics={topics}
          disabled={disabled}
          onChange={onChangeTopics}
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
              size="icon-sm"
              variant="ghost"
              disabled={disabled}
              aria-label={t("review.digest_view_source_action")}
              onClick={onViewSource}
              className={cn(
                "size-6 rounded-full text-fg-tertiary",
                sourceActive && "bg-fg-primary/10 text-fg-primary",
              )}
            >
              <FileText />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("review.digest_view_source_action")}
          </TooltipContent>
        </Tooltip>
        <Text
          as="label"
          htmlFor={viewedFieldId}
          size="xs"
          color="tertiary"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1",
            viewed && "bg-fg-primary/10 text-fg-primary",
          )}
        >
          <Checkbox
            id={viewedFieldId}
            disabled={disabled}
            checked={viewed}
            onCheckedChange={onToggleViewed}
          />
          {t("review.digest_viewed_action")}
        </Text>
        <DigestCardMenu
          currentType={type}
          disabled={disabled}
          onChangeType={onChangeType}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
