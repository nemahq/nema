import { useState } from "react";

import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceDeleteConfirmFormProps {
  spaceId: string;
  spaceName: string;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function SpaceDeleteConfirmForm({
  spaceId,
  spaceName,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFormProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const deleteMutation = useDeleteSpace();

  const canDelete = confirmText === spaceName;

  function handleDelete() {
    if (!canDelete) {
      return;
    }
    deleteMutation.mutate(
      { spaceId },
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
          {t("space.delete_confirm_instruction", { name: spaceName })}
        </label>
        <Input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={spaceName}
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
