import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { useTranslation } from "@web/lib/tolgee";

interface RevertChangesetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function RevertChangesetDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: RevertChangesetDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("review.detail_revert_dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("review.detail_revert_dialog_description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {t("review.detail_revert_action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
