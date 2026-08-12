import { containsForbiddenSpaceNameChars } from "@nema-io/shared";
import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { useUpdateSpace } from "@web/features/workspace/hooks/useUpdateSpace";
import { isSpaceNameTaken } from "@web/features/workspace/isSpaceNameTaken";
import { useSpaceList } from "@web/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceNameField } from "./SpaceNameField";

interface SpaceSettingsFormProps {
  spaceId: string;
  spaceName: string;
  onOpenChange: (open: boolean) => void;
}

export function SpaceSettingsForm({
  spaceId,
  spaceName,
  onOpenChange,
}: SpaceSettingsFormProps) {
  const { t } = useTranslation();
  const { data: spaceList } = useSpaceList();
  const field = useSpaceNameField(spaceName);
  const updateMutation = useUpdateSpace();
  const trimmedName = field.name.trim();
  const isEmpty = trimmedName === "";
  const isUnchanged = trimmedName === spaceName;
  const hasInvalidChars =
    !isEmpty && !isUnchanged && containsForbiddenSpaceNameChars(trimmedName);
  const isDuplicate =
    !isEmpty &&
    !isUnchanged &&
    !hasInvalidChars &&
    isSpaceNameTaken(spaceList?.spaces ?? [], trimmedName, spaceId);

  let nameError: string | null = null;
  if (field.touched && isEmpty) {
    nameError = t("common.name_required");
  } else if (hasInvalidChars) {
    nameError = t("common.name_invalid_chars");
  } else if (isDuplicate) {
    nameError = t("common.name_taken");
  }

  function handleSubmit() {
    if (
      updateMutation.isPending ||
      isEmpty ||
      isUnchanged ||
      hasInvalidChars ||
      isDuplicate
    ) {
      return;
    }

    updateMutation.mutate(
      { spaceId, name: trimmedName },
      {
        onSuccess: () => onOpenChange(false),
        onError: field.markConflictIfNameTaken,
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.settings_title")}</DialogTitle>
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
            updateMutation.isPending ||
            isEmpty ||
            isUnchanged ||
            hasInvalidChars ||
            isDuplicate
          }
        >
          {updateMutation.isPendingAfterDelay
            ? t("common.saving")
            : t("common.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
