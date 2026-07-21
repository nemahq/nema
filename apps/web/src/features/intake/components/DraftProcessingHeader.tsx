import {
  Button,
  cn,
  NESTED_HOVER_ICON_CLASSNAME,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useCancelSource } from "@web/features/intake/hooks/useCancelSource";
import type { DraftHeaderProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DraftTitle } from "./DraftTitle";

// 문구 없이 아이콘만 — 처리 중엔 다른 액션(추출·삭제·Space변경)이 전부 비활성
// 이라 설명할 대상이 없다. Space 정보는 카드에서 뺐다 — 상세 클릭이 한 번이면
// 되는 만큼, 카드는 시각+취소만 남기고 나머지는 상세에서 확인한다.
export function DraftProcessingHeader({
  sourceId,
  title,
  createdAt,
}: DraftHeaderProps) {
  const { t } = useTranslation();
  const cancelMutation = useCancelSource();

  function handleCancel() {
    cancelMutation.mutate({ sourceId });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <DraftTitle title={title} size="base" weight="medium" color="primary" />
        <RelativeTime dateTime={createdAt} className="text-xs" />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.cancel")}
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            className={cn(
              "pointer-events-auto size-6 rounded-full text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              NESTED_HOVER_ICON_CLASSNAME,
            )}
          >
            <RotateCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={3}>
          {t("common.cancel")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
