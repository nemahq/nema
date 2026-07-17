import { type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";

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

import { useSpaceList } from "@web/features/workspace";
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
  // Space 삭제로 draft가 다른 Space로 재배정되면 space.list가 무효화된다 —
  // Suspense 쿼리는 그때마다 이 pill을 다시 매달아 깜빡이므로, 대신 이전
  // 목록을 보여준 채 조용히 갱신한다(placeholderData는 useSuspenseQuery에서
  // 지원 안 해 일반 쿼리로 내려감).
  const { data: spaceList, isError } = useSpaceList({
    placeholderData: keepPreviousData,
  });
  const space = spaceList?.spaces.find((candidate) => candidate.id === spaceId);

  // isError여도 keepPreviousData가 채워둔 이전 목록이 있으면 그걸 계속 보여준다 —
  // 배경 갱신 실패로 보여줄 게 아예 없을 때만 로딩과 구분해 빈 상태로 내린다.
  if (!spaceList) {
    return isError ? (
      <span />
    ) : (
      <Skeleton className="-ml-2.5 h-6 w-24 rounded-full" />
    );
  }

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
      <DraftSpacePill
        spaceId={spaceId}
        onReassignSpace={onReassignSpace}
        reassignPending={reassignPending}
      />
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
