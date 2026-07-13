import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useDeleteSource } from "@web/features/intake/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface DeleteSourceDialogProps {
  sourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteSourceDialog({
  sourceId,
  open,
  onOpenChange,
}: DeleteSourceDialogProps) {
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
            {t("intake.draft_delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
