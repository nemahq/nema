import { useState } from "react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";

interface DraftDeleteActionProps {
  sourceId: string;
  disabled?: boolean;
  onDeleted?: () => void;
}

export function DraftDeleteAction({
  sourceId,
  disabled,
  onDeleted,
}: DraftDeleteActionProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.delete")}
            onClick={() => setDialogOpen(true)}
            disabled={disabled}
            className="size-7 text-fg-tertiary"
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("common.delete")}</TooltipContent>
      </Tooltip>
      <DeleteSourceDialog
        sourceId={sourceId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDeleted={onDeleted}
      />
    </>
  );
}
