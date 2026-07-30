import { useState } from "react";

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoverIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Ellipsis, Settings, Trash2 } from "@nema-io/weave/icons";

import { DropdownMenu } from "@web/components/ui/DropdownMenu";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceItemMenuProps {
  onOpenSettings: () => void;
  onDelete: () => void;
}

export function SpaceItemMenu({
  onOpenSettings,
  onDelete,
}: SpaceItemMenuProps) {
  const { t } = useTranslation();
  // Tooltip과 DropdownMenu 둘 다 트리거에 asChild로 겹쳐 있으면 Radix가 각자의
  // data-state를 같은 DOM 노드에 병합하다가 바깥쪽(Tooltip) 것이 안쪽(DropdownMenu)
  // 것을 덮어써서, 메뉴가 열려 있어도 트리거의 data-state가 "closed"로 찍히는
  // 문제가 있었다(버튼이 opacity-0로 사라짐). data-[state=open]: 셀렉터 대신
  // 실제 열림 여부를 직접 든다.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <HoverIcon
              aria-label={t("space.menu")}
              active={menuOpen}
              className="absolute right-3.5 cursor-pointer"
              onClick={(e) => e.preventDefault()}
            >
              <Ellipsis className="size-4" />
            </HoverIcon>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("space.menu")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="min-w-44"
      >
        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings />
          {t("space.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onClick={onDelete}>
          <Trash2 />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
