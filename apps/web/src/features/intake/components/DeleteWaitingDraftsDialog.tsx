import { useState } from "react";

import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

interface DeleteWaitingDraftsDialogProps {
  sourceIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteWaitingDraftsDialog({
  sourceIds,
  open,
  onOpenChange,
}: DeleteWaitingDraftsDialogProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingAfterDelay = usePendingAfterDelay(isDeleting);

  // useDeleteSource(단건용 훅)는 성공마다 자기 onSuccess에서 listPending을
  // invalidate한다 — 이 훅 하나로 N번 병렬 호출하면 삭제가 끝날 때마다 목록
  // refetch가 줄줄이 걸려 체감 속도가 크게 느려진다. utils.client로 훅을
  // 거치지 않고 직접 호출해 개별 invalidate를 피하고, 다 끝난 뒤 한 번만 한다.
  async function handleDeleteAll() {
    setIsDeleting(true);
    try {
      await Promise.allSettled(
        sourceIds.map((sourceId) =>
          utils.client.source.delete.mutate({ sourceId }),
        ),
      );
      await utils.source.listPending.invalidate();
    } finally {
      setIsDeleting(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {t("intake.drafts_delete_waiting_confirm_title", {
              count: sourceIds.length,
            })}
          </DialogTitle>
          <DialogDescription>
            {t("intake.draft_delete_confirm_description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteAll}
            disabled={isDeleting}
          >
            {isDeletingAfterDelay ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
