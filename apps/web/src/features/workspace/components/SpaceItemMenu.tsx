import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Ellipsis, Pencil, Trash2 } from "@nema-io/weave/icons";

import { LnbHoverIcon } from "@web/components/layout/LnbHoverIcon";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceItemMenuProps {
  onRename: () => void;
  onDelete: () => void;
}

export function SpaceItemMenu({ onRename, onDelete }: SpaceItemMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <LnbHoverIcon
          aria-label={t("space.menu")}
          className="absolute right-3.5 cursor-pointer group-hover:opacity-100 data-[state=open]:bg-surface-raised-hover data-[state=open]:opacity-100"
          onClick={(e) => e.preventDefault()}
        >
          <Ellipsis className="size-4 text-fg-tertiary" />
        </LnbHoverIcon>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={4}>
        <DropdownMenuItem onClick={onRename}>
          <Pencil />
          {t("space.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onClick={onDelete}>
          <Trash2 />
          {t("space.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
