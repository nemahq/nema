import { type ReactNode } from "react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface DraftDetailHeaderProps {
  // 좌측 Space 표시 — 상태에 따라 읽기 전용(DraftSpaceLabel)이거나
  // 재지정 가능한 셀렉트(DraftSpaceSelect)라, 헤더는 무엇이 오는지 모른다.
  spaceSlot: ReactNode;
  // Working의 취소처럼, 상태별로 닫기 옆에 추가로 필요한 액션이 있을 때만 쓴다.
  extraAction?: ReactNode;
  onClose: () => void;
}

export function DraftDetailHeader({
  spaceSlot,
  extraAction,
  onClose,
}: DraftDetailHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-6">
      {spaceSlot}
      {/* -mr-1: 닫기 버튼(size-7)의 아이콘(size-5)이 히트박스 안에서 4px
          안쪽으로 들어가 있어, 보정 없이는 아이콘이 px-6보다 더 안쪽에서
          끝나 버린다(pill이 -ml-2.5로 텍스트를 px-6 경계에 맞춘 것과 비대칭).
          그만큼 오른쪽으로 밀어 아이콘 우측 끝을 px-6 경계에 맞춘다. */}
      <div className="-mr-1 flex shrink-0 items-center gap-1">
        {extraAction}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("common.close")}
              onClick={onClose}
              className="size-7 text-fg-tertiary"
            >
              <X className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("common.close")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
