import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { isSpaceNameTaken } from "@web/features/workspace/isSpaceNameTaken";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceNameField } from "./SpaceNameField";

const NAME_INPUT_ID = "space-create-name";

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
  const isDuplicate =
    !isEmpty && isSpaceNameTaken(spaceList?.spaces ?? [], trimmedName);

  let nameError: string | null = null;
  if (field.touched && isEmpty) {
    nameError = t("common.name_required");
  } else if (isDuplicate) {
    nameError = t("common.name_taken");
  }

  function handleSubmit() {
    if (createMutation.isPending || isEmpty || isDuplicate) {
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
        id={NAME_INPUT_ID}
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
          disabled={createMutation.isPending || isEmpty || isDuplicate}
        >
          {createMutation.isPendingAfterDelay
            ? t("common.creating")
            : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
