import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import { useCancelSource } from "@web/features/intake/hooks/useCancelSource";
import type { DraftDetailPanelProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DraftBodyView } from "./DraftBodyView";
import { DraftDetailHeader } from "./DraftDetailHeader";
import { DraftTitle } from "./DraftTitle";

// 처리 중엔 원본 편집·재생성 둘 다 막는다 — 엔진이 지금 이 내용으로 한창
// 처리 중인데 고치거나 재트리거하면 앞뒤가 안 맞는다(Space재지정·삭제가 같은
// 이유로 처리 중엔 막혀있는 것과 동일). 읽기 전용 전문만 보여준다. 취소는
// 카드의 취소 버튼과 같은 무게(작은 ghost 아이콘)라 닫기 옆 헤더에 같이 둔다 —
// 재생성처럼 primary 톤이었다면 닫기와 안 어울렸겠지만, 취소는 닫기와 성격이
// 비슷한 chrome급 액션이라 무리 없다.
// status/onBodyDirtyChange는 IdleDraftDetailPanel과 상세 패널 자리를 동적으로
// 바꿔 끼우는 소비처(DraftsScreen)가 두 컴포넌트에 같은 prop 모양을 넘기므로
// 받아만 두고 쓰지 않는다 — 처리 중엔 읽기 전용이라 원문이 편집될 일이 없다.
export function WorkingDraftDetailPanel({
  sourceId,
  spaceId,
  title,
  body,
  onClose,
}: DraftDetailPanelProps) {
  const { t } = useTranslation();
  const cancelMutation = useCancelSource();

  function handleCancel() {
    cancelMutation.mutate({ sourceId });
  }

  return (
    <div className="flex h-full flex-col">
      <DraftDetailHeader
        spaceId={spaceId}
        onClose={onClose}
        extraAction={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("common.cancel")}
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="size-7 text-fg-tertiary"
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("common.cancel")}</TooltipContent>
          </Tooltip>
        }
      />
      <DraftTitle
        title={title}
        showPlaceholder
        className="block px-6 pt-4 text-xl font-bold text-fg-primary"
      />
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <DraftBodyView value={body} readOnly />
      </div>
    </div>
  );
}
