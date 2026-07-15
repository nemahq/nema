import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";
import { SearchX, TriangleAlert } from "@nema-io/weave/icons";

import type { DraftCardProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";

interface IdleDraftCardProps extends DraftCardProps {
  // 상세에서 원문을 이미 고친 상태 — empty의 "결과없음" 아이콘은 이 신호가
  // 사라져야 할 근거(정리 버튼이 풀리는 조건과 동일)라 카드에서도 뗀다.
  isEdited?: boolean;
}

// cancelled는 표시 없음 — 취소는 사용자가 스스로 한 행동이라 별도 안내가
// 필요 없다. failed/empty만 아이콘으로 "왜 여기 있는지"를 알려준다 — 배지
// 문구 대신 LNB(DraftsNavItem)의 실패 표시와 같은 아이콘 언어를 그대로 쓴다.
// failed(경고 삼각형)는 업계에서 이미 명시적인 기호라 툴팁 없이 두고, empty
// (돋보기+X)는 관용화된 기호가 아니라 툴팁으로 의미를 보완한다 — 일괄 적용이
// 아니라 실제로 모호한 것만.
export function IdleDraftCard({
  sourceId,
  spaceId,
  title,
  body,
  status,
  createdAt,
  onSelect,
  isEdited,
}: IdleDraftCardProps) {
  const { t } = useTranslation();

  let statusIcon = null;
  if (status === "failed") {
    statusIcon = (
      <TriangleAlert className="size-4 shrink-0 text-status-error" />
    );
  } else if (status === "empty" && !isEdited) {
    statusIcon = (
      <Tooltip>
        <TooltipTrigger asChild>
          <SearchX className="pointer-events-auto size-4 shrink-0 text-fg-tertiary" />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("intake.draft_no_result_tooltip")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DraftCardShell onSelect={onSelect}>
      <DraftIdleHeader
        sourceId={sourceId}
        spaceId={spaceId}
        title={title}
        createdAt={createdAt}
        icon={statusIcon}
      />
      <p className="line-clamp-4 text-sm leading-relaxed text-fg-tertiary">
        {body}
      </p>
    </DraftCardShell>
  );
}
