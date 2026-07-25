import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { useDeleteSource } from "@web/features/intake/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface DeleteSourceDialogProps {
  sourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 상세 패널에서 열었을 때, 삭제된 항목을 계속 띄워두지 않도록 패널도 같이
  // 닫기 위한 훅 — 카드(목록)에서 열었을 때는 필요 없어 옵셔널.
  onDeleted?: () => void;
}

export function DeleteSourceDialog({
  sourceId,
  open,
  onOpenChange,
  onDeleted,
}: DeleteSourceDialogProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSource();

  function handleDelete() {
    deleteMutation.mutate(
      { sourceId },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDeleted?.();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("intake.draft_delete_confirm_title")}</DialogTitle>
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
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPendingAfterDelay
              ? t("common.deleting")
              : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
