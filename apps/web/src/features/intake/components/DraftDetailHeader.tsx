import { type ReactNode, Suspense } from "react";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Check, X } from "@nema-io/weave/icons";

import { useSpaceListSuspenseQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

// min-w-0: flex item 기본값(min-width: auto)이 내용 크기 이하로 안 줄어들게
// 막아서, 이게 없으면 truncate가 있어도 패널이 좁아질 때 pill이 안 줄어들고
// 줄바꿈으로 흘러넘친다.
const SPACE_PILL_CLASSNAME =
  "-ml-2.5 min-w-0 truncate rounded-full bg-fg-primary/10 px-2.5 py-1 text-xs font-medium text-fg-primary";

interface DraftSpacePillProps {
  spaceId: string;
  onReassignSpace?: (spaceId: string) => void;
  reassignPending?: boolean;
}

function DraftSpacePill({
  spaceId,
  onReassignSpace,
  reassignPending,
}: DraftSpacePillProps) {
  const { t } = useTranslation();
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    return <span />;
  }

  if (!onReassignSpace) {
    return (
      <span className={SPACE_PILL_CLASSNAME} title={space.name}>
        {space.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={reassignPending}
          aria-label={t("intake.draft_change_space")}
          title={space.name}
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
        {spaceList.spaces.map((candidate) => (
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

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-6">
      <Suspense
        fallback={<Skeleton className="-ml-2.5 h-6 w-24 rounded-full" />}
      >
        <DraftSpacePill
          spaceId={spaceId}
          onReassignSpace={onReassignSpace}
          reassignPending={reassignPending}
        />
      </Suspense>
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
