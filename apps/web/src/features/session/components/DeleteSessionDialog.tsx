import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useDeleteSession } from "@web/features/session/hooks/useDeleteSession";
import { useTranslation } from "@web/lib/tolgee";

interface DeleteSessionDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onDeleted,
}: DeleteSessionDialogProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSession();

  function handleDelete() {
    deleteMutation.mutate(
      { sessionId },
      {
        onSuccess: () => {
          onDeleted();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("session.delete_confirm_title")}</DialogTitle>
          <DialogDescription>
            {t("session.delete_confirm_description")}
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
            {t("session.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
