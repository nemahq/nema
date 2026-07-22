import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Ellipsis, Undo2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface ReferenceMergeCardMenuProps {
  disabled: boolean;
  // "원래대로"만의 조건(이미 원본과 같음)이라 트리거 자체를 막지 않는다 —
  // DigestCardMenu·ReferenceCardMenu처럼 이 메뉴도 나중에 액션이 늘 걸 감안해
  // 만들어졌는데, 트리거를 막으면 그때 늘어날 다른 액션까지 같이 가려진다.
  restoreDisabled: boolean;
  onRestore: () => void;
}

// ReferenceCardMenu·DigestCardMenu와 같은 이유로 메뉴 형태 — "원래대로"는 삭제가
// 아니라 병합 제안을 거부하는 것이라 danger 톤은 안 쓴다. 원문 보기와 달리 이건
// AI 제안에 동의 안 할 때만 쓰는 예외적 동작이라(매번 쓰는 게 아님) 상시 노출
// 대신 메뉴 뒤로 옮겼다.
export function ReferenceMergeCardMenu({
  disabled,
  restoreDisabled,
  onRestore,
}: ReferenceMergeCardMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              shape="circle"
              disabled={disabled}
              aria-label={t("review.reference_menu_label")}
              className="text-fg-tertiary"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("review.reference_menu_label")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" className="min-w-44">
        <DropdownMenuItem onClick={onRestore} disabled={restoreDisabled}>
          <Undo2 />
          {t("review.reference_merge_restore_action")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
