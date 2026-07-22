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
import { Ellipsis, Trash2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface ReferenceCardMenuProps {
  disabled: boolean;
  onRemove: () => void;
}

// DigestCardMenu와 같은 이유로 액션이 삭제 하나뿐이어도 메뉴 형태를 유지한다.
export function ReferenceCardMenu({
  disabled,
  onRemove,
}: ReferenceCardMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              shape="circle"
              disabled={disabled}
              aria-label={t("review.reference_menu_label")}
              className="size-6 text-fg-tertiary"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("review.reference_menu_label")}
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
