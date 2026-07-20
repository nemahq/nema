import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from "@nema-io/weave";
import { Check } from "@nema-io/weave/icons";

import { SPACE_PILL_CLASSNAME } from "@web/features/intake/constants";
import { useDraftSpace } from "@web/features/intake/hooks/useDraftSpace";
import { useReassignSourceSpace } from "@web/features/intake/hooks/useReassignSourceSpace";
import { useTranslation } from "@web/lib/tolgee";

interface DraftSpaceSelectProps {
  sourceId: string;
  spaceId: string;
  disabled?: boolean;
}

// 대기 중인 초안의 Space를 바꿀 수 있는 pill — 재지정 뮤테이션까지 여기서 소유해
// 상세 패널이 Space 도메인을 몰라도 되게 한다.
export function DraftSpaceSelect({
  sourceId,
  spaceId,
  disabled,
}: DraftSpaceSelectProps) {
  const { t } = useTranslation();
  const { spaces, spaceName, isLoading } = useDraftSpace(spaceId);
  const reassignMutation = useReassignSourceSpace();

  function handleReassign(nextSpaceId: string) {
    if (nextSpaceId === spaceId) {
      return;
    }
    reassignMutation.mutate({ sourceId, spaceId: nextSpaceId });
  }

  if (isLoading) {
    return <Skeleton className="-ml-2.5 h-6 w-24 rounded-full" />;
  }

  if (!spaceName || !spaces) {
    return <span />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || reassignMutation.isPending}
          aria-label={t("intake.draft_change_space")}
          title={spaceName}
          className={cn(
            SPACE_PILL_CLASSNAME,
            "cursor-pointer hover:bg-fg-primary/15",
          )}
        >
          {spaceName}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={240}>
        {/* weave Select의 선택 표시(우측 체크마크)를 그대로 따른다 — 라디오
            점 대신, 좌측 텍스트는 그대로 두고 우측에만 체크를 얹는다. */}
        {spaces.map((candidate) => (
          <DropdownMenuItem
            key={candidate.id}
            className="pr-8"
            onClick={() => handleReassign(candidate.id)}
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
