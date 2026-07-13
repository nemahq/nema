import { useState } from "react";

import { Button } from "@nema-io/weave";
import { Play, Trash2 } from "@nema-io/weave/icons";

import { useExtractSource } from "@web/features/intake/hooks/useExtractSource";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";

interface DraftIdleActionsProps {
  sourceId: string;
}

export function DraftIdleActions({ sourceId }: DraftIdleActionsProps) {
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const extractMutation = useExtractSource();

  function handleExtract() {
    extractMutation.mutate({ sourceId });
  }

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <Button
        size="sm"
        variant="secondary"
        onClick={handleExtract}
        disabled={extractMutation.isPending}
      >
        <Play />
        {extractMutation.isPendingAfterDelay
          ? t("intake.draft_extracting")
          : t("intake.draft_extract")}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("common.delete")}
        onClick={() => setDeleteDialogOpen(true)}
      >
        <Trash2 />
      </Button>

      <DeleteSourceDialog
        sourceId={sourceId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
