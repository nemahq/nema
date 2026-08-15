import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { useDeleteSource } from "@web/features/source/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface DraftDeleteDialogProps {
  sourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 아직 다이제스트가 없는(초안) 원문 삭제라 CASCADE 경고 없이 "되돌릴 수 없다"만
// 말한다 — source.delete_confirm_description(다이제스트가 함께 사라진다는 문구)과
// 다른 이유.
export function DraftDeleteDialog({
  sourceId,
  open,
  onOpenChange,
}: DraftDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSource();

  function handleDelete() {
    deleteMutation.mutate(
      { sourceId },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("draft.delete_confirm_title")}</DialogTitle>
          <DialogDescription>
            {t("draft.delete_confirm_description")}
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
