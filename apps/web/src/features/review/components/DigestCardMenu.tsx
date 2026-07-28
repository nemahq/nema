import { useState } from "react";

import {
  Button,
  cn,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Ellipsis, Trash2 } from "@nema-io/weave/icons";

import { DropdownMenu } from "@web/components/ui/DropdownMenu";
import { useTranslation } from "@web/lib/tolgee";

interface DigestCardMenuProps {
  disabled: boolean;
  onRemove: () => void;
}

// 타입 변경은 DigestTypePicker(헤더의 상시 노출 Chip)로 옮겨갔다 — 여기 남은 건
// 삭제뿐이지만, 나중에 액션이 늘 걸 감안해 독립 아이콘 대신 메뉴 형태를 유지한다.
export function DigestCardMenu({ disabled, onRemove }: DigestCardMenuProps) {
  const { t } = useTranslation();
  // Tooltip과 DropdownMenu 둘 다 트리거에 asChild로 겹쳐 있으면 Radix가 각자의
  // data-state를 같은 DOM 노드에 병합하다가 바깥쪽(Tooltip) 것이 안쪽(DropdownMenu)
  // 것을 덮어써서, 메뉴가 열려 있어도 트리거의 data-state가 "closed"로 찍히는
  // 문제가 있다(SpaceItemMenu와 동일). data-[state=open]: 셀렉터 대신 실제
  // 열림 여부를 직접 든다.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              shape="circle"
              disabled={disabled}
              aria-label={t("review.digest_menu_label")}
              className={cn(
                "text-fg-tertiary",
                menuOpen &&
                  "bg-surface-raised-hover/75 dark:bg-surface-raised-hover",
              )}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("review.digest_menu_label")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" className="min-w-44">
        <DropdownMenuItem variant="danger" onClick={onRemove}>
          <Trash2 />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
