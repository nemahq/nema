import type { ReactNode } from "react";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Check, X } from "@nema-io/weave/icons";

import { useSpaceList } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

// min-w-0: flex item 기본값(min-width: auto)이 내용 크기 이하로 안 줄어들게
// 막아서, 이게 없으면 truncate가 있어도 패널이 좁아질 때 pill이 안 줄어들고
// 줄바꿈으로 흘러넘친다.
const SPACE_PILL_CLASSNAME =
  "-ml-2.5 min-w-0 truncate rounded-full bg-fg-primary/10 px-2.5 py-1 text-xs font-medium text-fg-primary";

interface DraftDetailHeaderProps {
  spaceId: string;
  onClose: () => void;
  // Working의 취소처럼, 상태별로 닫기 옆에 추가로 필요한 액션이 있을 때만 쓴다.
  extraAction?: ReactNode;
  // 있으면 Space pill이 재지정 가능한 드롭다운으로 바뀐다 — Working처럼 처리 중엔
  // 재지정도 막히므로 안 넘기면 지금처럼 읽기 전용 pill 그대로 남는다.
  onReassignSpace?: (spaceId: string) => void;
  reassignPending?: boolean;
}

export function DraftDetailHeader({
  spaceId,
  onClose,
  extraAction,
  onReassignSpace,
  reassignPending,
}: DraftDetailHeaderProps) {
  const { t } = useTranslation();
  const spaceListQuery = useSpaceList();
  const space = spaceListQuery.data?.spaces.find(
    (candidate) => candidate.id === spaceId,
  );

  let spaceArea: ReactNode = <span />;
  if (space && !onReassignSpace) {
    spaceArea = <span className={SPACE_PILL_CLASSNAME}>{space.name}</span>;
  } else if (space && onReassignSpace) {
    spaceArea = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={reassignPending}
            aria-label={t("intake.draft_change_space")}
            className={cn(
              SPACE_PILL_CLASSNAME,
              "cursor-pointer hover:bg-fg-primary/15",
            )}
          >
            {space.name}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" width={240}>
          {/* weave Select의 선택 표시(우측 체크마크)를 그대로 따른다 — 라디오
              점 대신, 좌측 텍스트는 그대로 두고 우측에만 체크를 얹는다. */}
          {(spaceListQuery.data?.spaces ?? []).map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              className="pr-8"
              onClick={() => onReassignSpace(candidate.id)}
            >
              {candidate.name}
              {candidate.id === spaceId && (
                <span className="absolute right-2 flex size-3.5 items-center justify-center">
                  <Check className="size-4" />
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-6">
      {spaceArea}
      <div className="flex shrink-0 items-center gap-1">
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
