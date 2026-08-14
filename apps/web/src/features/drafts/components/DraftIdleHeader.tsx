import { type ReactNode, useState } from "react";

import {
  Button,
  cn,
  NESTED_HOVER_ICON_CLASSNAME,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useTranslation } from "@web/lib/tolgee";

import { DraftDeleteDialog } from "./DraftDeleteDialog";

interface DraftIdleHeaderProps {
  sourceId: string;
  name: string;
  createdAt: string;
  // pending/completed 상태 아이콘 — 있으면 시각 옆에 같이 묶어 보여준다.
  icon: ReactNode;
}

export function DraftIdleHeader({
  sourceId,
  name,
  createdAt,
  icon,
}: DraftIdleHeaderProps) {
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="flex h-6 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Text
          size="sm"
          weight="medium"
          color="primary"
          className="min-w-0 truncate"
        >
          {name}
        </Text>
        <RelativeTime dateTime={createdAt} className="text-xs" />
        <span className="flex size-6 shrink-0 items-center justify-center">
          {icon}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            shape="circle"
            aria-label={t("common.delete")}
            onClick={() => setDeleteDialogOpen(true)}
            className={cn(
              "pointer-events-auto text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              NESTED_HOVER_ICON_CLASSNAME,
            )}
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={3}>
          {t("common.delete")}
        </TooltipContent>
      </Tooltip>

      <DraftDeleteDialog
        sourceId={sourceId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
