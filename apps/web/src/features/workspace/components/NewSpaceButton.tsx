import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceModal } from "./SpaceModal";

const ICON_CLASS = "size-4";

export function NewSpaceButton() {
  const { collapsed } = useSidebar();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (collapsed) {
    return (
      <div className="flex justify-center py-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("workspace.new_space")}
              onClick={() => setOpen(true)}
              className="flex size-9 cursor-pointer items-center justify-center rounded-md text-fg-tertiary transition-colors duration-fast hover:bg-surface-raised-hover"
            >
              <Plus strokeWidth={1.5} className={ICON_CLASS} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t("workspace.new_space")}
          </TooltipContent>
        </Tooltip>
        <SpaceModal mode="create" open={open} onOpenChange={setOpen} />
      </div>
    );
  }

  return (
    <div className="px-1.5 py-0.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-sm text-fg-tertiary transition-colors duration-fast hover:bg-surface-raised-hover hover:text-fg-primary"
      >
        <Plus strokeWidth={1.5} className={ICON_CLASS} />
        {t("workspace.new_space")}
      </button>
      <SpaceModal mode="create" open={open} onOpenChange={setOpen} />
    </div>
  );
}
