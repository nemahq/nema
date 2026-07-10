import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceDeleteDialogProps {
  space: { id: string; name: string };
  isLastSpace: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

interface SpaceDeleteBlockedFormProps {
  onOpenChange: (open: boolean) => void;
}

function SpaceDeleteBlockedForm({ onOpenChange }: SpaceDeleteBlockedFormProps) {
  const { t } = useTranslation();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_title")}</DialogTitle>
        <DialogDescription>{t("space.delete_last_blocked")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
      </DialogFooter>
    </>
  );
}

interface SpaceDeleteConfirmFormProps {
  space: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function SpaceDeleteConfirmForm({
  space,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFormProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const deleteMutation = useDeleteSpace();

  const canDelete = confirmText === space.name;

  function handleDelete() {
    if (!canDelete) {
      return;
    }
    deleteMutation.mutate(
      { spaceId: space.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDeleted();
        },
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_title")}</DialogTitle>
        <DialogDescription>{t("space.delete_warning")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fg-tertiary">
          {t("space.delete_confirm_instruction", { name: space.name })}
        </label>
        <Input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={space.name}
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={!canDelete || deleteMutation.isPending}
        >
          {t("space.delete")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SpaceDeleteDialog({
  space,
  isLastSpace,
  open,
  onOpenChange,
  onDeleted,
}: SpaceDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open &&
          (isLastSpace ? (
            <SpaceDeleteBlockedForm onOpenChange={onOpenChange} />
          ) : (
            <SpaceDeleteConfirmForm
              space={space}
              onOpenChange={onOpenChange}
              onDeleted={onDeleted}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
