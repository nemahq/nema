import { Badge, cn, TAG_COLOR_CLASSNAME, Text } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  ARCHIVED_BADGE_LABEL_KEY,
  type ArchivedBadgeCause,
  DIGEST_TYPE_BADGE_COLOR,
  DIGEST_TYPE_ICON,
  DIGEST_TYPE_LABEL_KEY,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import { DIGEST_DESCRIPTION_FIELD_CLASS } from "@web/features/review/digestFieldTypography";
import type { DigestDetailSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestReadonlyBodyFields } from "./DigestReadonlyBodyFields";

interface DigestReadonlyCardProps {
  digest: DigestDetailSnapshot;
  // 관계(충돌·중복·확신) 판정에서 밀려난 쪽 — 제목 취소선+카드 전체를 낮춤(opacity)
  // +원인별 배지(대체됨/병합됨/해소됨) 세 가지를 함께 얹어 표시한다. undefined면
  // 밀려나지 않은 쪽이라 셋 다 없다. 어느 body-field가 관련 문장인지는 아래
  // highlightedField가 별도로 짚는다.
  archivedBadge?: ArchivedBadgeCause;
  highlightedFieldKey?: DigestBodyFieldKey;
  highlightedFieldIndex?: number;
  className?: string;
}

// Digest 리뷰 화면(확정 직후)·관계 판정 화면(A·B 비교)·Changeset 상세(스냅샷) 세 화면이
// 공유할 읽기 전용 카드(surface-inventory.md ".digest-readonly"). DigestCandidateCard와
// 달리 ReviewDraftProvider·편집 필드에 전혀 의존하지 않는 순수 표시 컴포넌트다 —
// 확정된 값은 다시 만질 수 없어야 한다는 원칙(surface-inventory.md) 그대로다.
export function DigestReadonlyCard({
  digest,
  archivedBadge,
  highlightedFieldKey,
  highlightedFieldIndex,
  className,
}: DigestReadonlyCardProps) {
  const { t } = useTranslation();
  const TypeIcon = DIGEST_TYPE_ICON[digest.body.type];

  return (
    <CandidateCardFrame
      viewed={false}
      className={cn(archivedBadge && "opacity-60", className)}
      wash={
        <>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Chip이 아니라 Badge — Chip은 onClick 없이도 항상 <button>이라
                  이 읽기 전용 카드에서도 hover·클릭 가능한 것처럼 보였다
                  (Chip.tsx 주석 "정적 미리보기가 필요한 자리는 Badge를 쓴다"). */}
              <Badge
                shape="pill"
                color={DIGEST_TYPE_BADGE_COLOR[digest.body.type]}
              >
                <span className="inline-flex items-center gap-1">
                  <TypeIcon className="size-3.5" />
                  {t(DIGEST_TYPE_LABEL_KEY[digest.body.type])}
                </span>
              </Badge>
              <Text
                as="span"
                size="xl"
                weight="semibold"
                className={cn(
                  "min-w-0 truncate",
                  archivedBadge && "line-through",
                )}
              >
                {digest.title}
              </Text>
            </div>
            {archivedBadge && (
              <Badge
                variant="neutral"
                shape="pill"
                size="sm"
                className="shrink-0"
              >
                {t(ARCHIVED_BADGE_LABEL_KEY[archivedBadge])}
              </Badge>
            )}
          </div>
          {digest.topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {digest.topics.map((topic, index) => (
                <span key={topic.id} className="flex items-center gap-1">
                  {index > 0 && (
                    <Circle className="size-1 shrink-0 fill-current text-fg-tertiary" />
                  )}
                  <Text as="span" size="xs" color="primary">
                    {topic.title}
                  </Text>
                </span>
              ))}
            </div>
          )}
          {digest.description && (
            <p className={DIGEST_DESCRIPTION_FIELD_CLASS}>
              {digest.description}
            </p>
          )}
          <Text as="div" size="sm" color="tertiary">
            {digest.authorName && `${digest.authorName} · `}
            <RelativeTime dateTime={digest.createdAt} />
          </Text>
        </>
      }
    >
      <DigestReadonlyBodyFields
        body={digest.body}
        highlightedFieldKey={highlightedFieldKey}
        highlightedFieldIndex={highlightedFieldIndex}
      />
      {digest.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1 pl-2">
          {digest.tags.map((tag) => (
            <Badge
              key={tag.id}
              shape="rounded"
              truncated
              className={TAG_COLOR_CLASSNAME[tag.color]}
            >
              {tag.title}
            </Badge>
          ))}
        </div>
      )}
    </CandidateCardFrame>
  );
}
