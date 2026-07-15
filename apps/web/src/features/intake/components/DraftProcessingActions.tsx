import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useCancelSource } from "@web/features/intake/hooks/useCancelSource";
import type { DraftFooterProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DraftTitle } from "./DraftTitle";

// 문구 없이 아이콘만 — 처리 중엔 다른 액션(추출·삭제·Space변경)이 전부 비활성
// 이라 설명할 대상이 없다. Space 정보는 카드에서 뺐다 — 상세 클릭이 한 번이면
// 되는 만큼, 카드는 시각+취소만 남기고 나머지는 상세에서 확인한다.
export function DraftProcessingActions({
  sourceId,
  title,
  createdAt,
}: DraftFooterProps) {
  const { t } = useTranslation();
  const cancelMutation = useCancelSource();

  function handleCancel() {
    cancelMutation.mutate({ sourceId });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <DraftTitle
          title={title}
          className="text-sm font-medium text-fg-primary"
        />
        <RelativeTime dateTime={createdAt} className="text-xs" />
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 취소 버튼 클릭만 카드 onClick(상세 열기)으로 버블링되는 걸 막는 래퍼다. 나머지(제목·시각) 영역은 그대로 버블링돼 카드 전체가 상세 열기 트리거가 되게 한다. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("common.cancel")}
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="size-6 rounded-full text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-raised-hover/70 hover:brightness-95 dark:hover:brightness-125"
            >
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={3}>
            {t("common.cancel")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
