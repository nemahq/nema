import { containsForbiddenSpaceNameChars } from "@nema-io/shared";
import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { isSpaceNameTaken } from "@web/features/workspace/isSpaceNameTaken";
import { useSpaceList } from "@web/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceNameField } from "./SpaceNameField";

interface SpaceCreateFormProps {
  onOpenChange: (open: boolean) => void;
}

export function SpaceCreateForm({ onOpenChange }: SpaceCreateFormProps) {
  const { t } = useTranslation();
  const { data: spaceList } = useSpaceList();
  const field = useSpaceNameField();
  const createMutation = useCreateSpace();
  const trimmedName = field.name.trim();
  const isEmpty = trimmedName === "";
  const hasInvalidChars =
    !isEmpty && containsForbiddenSpaceNameChars(trimmedName);
  const isDuplicate =
    !isEmpty &&
    !hasInvalidChars &&
    isSpaceNameTaken(spaceList?.spaces ?? [], trimmedName);

  let nameError: string | null = null;
  if (field.touched && isEmpty) {
    nameError = t("common.name_required");
  } else if (hasInvalidChars) {
    nameError = t("common.name_invalid_chars");
  } else if (isDuplicate) {
    nameError = t("common.name_taken");
  }

  function handleSubmit() {
    if (createMutation.isPending || isEmpty || hasInvalidChars || isDuplicate) {
      return;
    }

    createMutation.mutate(
      { name: trimmedName },
      {
        onSuccess: () => onOpenChange(false),
        onError: field.markConflictIfNameTaken,
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.create_title")}</DialogTitle>
      </DialogHeader>

      <SpaceNameField
        value={field.name}
        onChange={field.handleChange}
        onEnter={handleSubmit}
        error={nameError}
        hasConflict={field.hasConflict}
      />

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            createMutation.isPending ||
            isEmpty ||
            hasInvalidChars ||
            isDuplicate
          }
        >
          {createMutation.isPendingAfterDelay
            ? t("common.creating")
            : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
