import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import { useCancelSource } from "@web/features/intake/hooks/useCancelSource";
import { useTranslation } from "@web/lib/tolgee";

import { DraftBodyView } from "./DraftBodyView";
import { DraftDetailHeader } from "./DraftDetailHeader";
import { DraftOrganizingIndicator } from "./DraftOrganizingIndicator";
import { DraftSpaceLabel } from "./DraftSpaceLabel";
import { DraftTitle } from "./DraftTitle";

interface WorkingDraftDetailPanelProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  createdAt: string;
  lastDigestionAttempt: string | null;
  onClose: () => void;
}

// 정리 중엔 원본 편집도, 정리 버튼 재실행도 막는다 — 엔진이 지금 이 내용으로
// 한창 정리하고 있는데 고치거나 재트리거하면 앞뒤가 안 맞는다(Space재지정·삭제가
// 같은 이유로 정리 중엔 막혀있는 것과 동일). 읽기 전용 전문만 보여준다. 취소는
// 카드의 취소 버튼과 같은 무게(작은 ghost 아이콘)라 닫기 옆 헤더에 같이 둔다 —
// 정리 버튼처럼 primary 톤이었다면 닫기와 안 어울렸겠지만, 취소는 닫기와 성격이
// 비슷한 chrome급 액션이라 무리 없다.
export function WorkingDraftDetailPanel({
  sourceId,
  spaceId,
  title,
  body,
  createdAt,
  lastDigestionAttempt,
  onClose,
}: WorkingDraftDetailPanelProps) {
  const { t } = useTranslation();
  const cancelMutation = useCancelSource();
  // 재시도·정리 재실행처럼 뒤늦게 다시 붙잡힌 시도는 lastDigestionAttempt가
  // 실제 시작 시점 — 아직 한 번도 안 붙잡혔으면(막 생성돼 큐에 갓 들어간 경우)
  // null이라 createdAt으로 대체한다.
  const organizingSince = lastDigestionAttempt ?? createdAt;

  function handleCancel() {
    cancelMutation.mutate({ sourceId });
  }

  return (
    <div className="flex h-full flex-col">
      <DraftDetailHeader
        onClose={onClose}
        spaceSlot={<DraftSpaceLabel spaceId={spaceId} />}
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
      <div className="px-6 pt-4">
        <DraftOrganizingIndicator since={organizingSince} />
      </div>
      <DraftTitle
        title={title}
        showPlaceholder
        size="lg"
        bold
        color="primary"
        className="block px-6 pt-3"
      />
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <DraftBodyView value={body} readOnly />
      </div>
    </div>
  );
}
