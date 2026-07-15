import type { ReactNode } from "react";
import { useState } from "react";

import {
  Button,
  cn,
  NESTED_HOVER_ICON_CLASSNAME,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { DraftFooterProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";
import { DraftTitle } from "./DraftTitle";

interface DraftIdleFooterProps extends DraftFooterProps {
  // failed/empty 상태 아이콘 — 있으면 시각 옆에 같이 묶어 보여준다.
  icon?: ReactNode;
}

export function DraftIdleFooter({
  sourceId,
  title,
  createdAt,
  icon,
}: DraftIdleFooterProps) {
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="flex h-6 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <DraftTitle
          title={title}
          className="text-sm font-medium text-fg-primary"
        />
        <RelativeTime dateTime={createdAt} className="text-xs" />
        {icon && (
          <span className="flex size-6 shrink-0 items-center justify-center">
            {icon}
          </span>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.delete")}
            onClick={() => setDeleteDialogOpen(true)}
            className={cn(
              "size-6 rounded-full text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              NESTED_HOVER_ICON_CLASSNAME,
            )}
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={3}>
          {t("common.delete")}
        </TooltipContent>
      </Tooltip>

      <DeleteSourceDialog
        sourceId={sourceId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
