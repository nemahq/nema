import { useId, useState } from "react";

import { SOURCE_TITLE_MAX_LENGTH } from "@nema-io/shared";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@nema-io/weave";

import { useUpdateSourceTitle } from "@web/features/intake/hooks/useUpdateSourceTitle";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

interface EditSourceTitleDialogProps {
  sourceId: string;
  title: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSourceTitleDialog({
  sourceId,
  title,
  open,
  onOpenChange,
}: EditSourceTitleDialogProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [value, setValue] = useState(title ?? "");
  const updateTitleMutation = useUpdateSourceTitle();

  // 다이얼로그가 다시 열릴 때마다 최신 제목으로 되돌린다 — 언마운트되지 않고 open만
  // 토글되므로, 마지막으로 편집하다 취소한 입력값이 다음 오픈에 남아있으면 안 된다.
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setValue(title ?? "");
    }
    onOpenChange(nextOpen);
  }

  const trimmedValue = value.trim();
  const isEmpty = trimmedValue.length === 0;

  function handleSave() {
    if (isEmpty) {
      return;
    }
    updateTitleMutation.mutate(
      { sourceId, title: trimmedValue },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("intake.draft_title_edit_title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={fieldId}
            className="text-sm font-medium text-fg-primary"
          >
            {t("intake.draft_title_edit_label")}
          </label>
          <Input
            id={fieldId}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
            maxLength={SOURCE_TITLE_MAX_LENGTH}
            disabled={updateTitleMutation.isPending}
            aria-invalid={isEmpty}
          />
        </div>

        {updateTitleMutation.error && (
          <Alert variant="error">
            {getErrorMessage(updateTitleMutation.error)}
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={updateTitleMutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isEmpty || updateTitleMutation.isPending}
          >
            {updateTitleMutation.isPendingAfterDelay
              ? t("common.saving")
              : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
