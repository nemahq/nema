import { Badge, Chip, cn, Text } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  DIGEST_TYPE_LABEL_KEY,
  DIGEST_TYPE_TAG_COLOR,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import type { DigestDetailSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestReadonlyBodyFields } from "./DigestReadonlyBodyFields";

interface DigestReadonlyCardProps {
  digest: DigestDetailSnapshot;
  // 관계(충돌·중복·확신) 판정에서 archived된 쪽 — 제목 취소선+카드 전체를 낮춤
  // (opacity)+"대체됨" 배지 세 가지를 함께 얹어 표시한다. 어느 body-field가
  // 관련 문장인지는 아래 highlightedField가 별도로 짚는다.
  archived?: boolean;
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
  archived = false,
  highlightedFieldKey,
  highlightedFieldIndex,
  className,
}: DigestReadonlyCardProps) {
  const { t } = useTranslation();

  return (
    <CandidateCardFrame
      viewed={false}
      className={cn(archived && "opacity-60", className)}
      wash={
        <>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Chip color={DIGEST_TYPE_TAG_COLOR[digest.body.type]}>
                {t(DIGEST_TYPE_LABEL_KEY[digest.body.type])}
              </Chip>
              <Text
                as="span"
                size="xl"
                weight="semibold"
                className={cn("min-w-0 truncate", archived && "line-through")}
              >
                {digest.title}
              </Text>
            </div>
            {archived && (
              <Badge
                variant="neutral"
                shape="pill"
                size="sm"
                className="shrink-0"
              >
                {t("review.digest_readonly_archived_badge")}
              </Badge>
            )}
          </div>
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
    </CandidateCardFrame>
  );
}
