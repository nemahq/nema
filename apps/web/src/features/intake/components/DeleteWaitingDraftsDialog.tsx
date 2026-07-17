import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { useDeleteWaitingDrafts } from "@web/features/intake/hooks/useDeleteWaitingDrafts";
import { useTranslation } from "@web/lib/tolgee";
import { toast } from "@web/utils/toast";

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
  const { deleteAll, isDeleting, isDeletingAfterDelay } =
    useDeleteWaitingDrafts();

  async function handleDeleteAll() {
    try {
      const { failedCount } = await deleteAll(sourceIds);
      onOpenChange(false);
      if (failedCount > 0) {
        toast.error(
          t("intake.drafts_delete_waiting_partial_failure", {
            failed: failedCount,
          }),
        );
      }
    } catch {
      // 요청 전체 실패(네트워크 오류 등)는 전역 MutationCache.onError가 이미
      // 토스트로 알린다 — 다이얼로그는 열어둔 채로 둬 재시도할 수 있게 한다.
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
