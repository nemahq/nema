import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Ellipsis, Pencil, Trash2 } from "@nema-io/weave/icons";

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
        <button
          type="button"
          aria-label={t("space.menu")}
          className="absolute right-3.5 flex size-5 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity duration-fast hover:bg-surface-raised-hover hover:brightness-95 dark:hover:brightness-125 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-surface-raised-hover data-[state=open]:opacity-100"
          onClick={(e) => e.preventDefault()}
        >
          <Ellipsis className="size-4 text-fg-tertiary" />
        </button>
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
