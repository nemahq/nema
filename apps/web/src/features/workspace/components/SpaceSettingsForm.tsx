import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { useUpdateSpace } from "@web/features/workspace/hooks/useUpdateSpace";
import { isSpaceNameTaken } from "@web/features/workspace/isSpaceNameTaken";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceNameField } from "./SpaceNameField";

const NAME_INPUT_ID = "space-settings-name";

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
  const isUnchanged = trimmedName === spaceName;
  const isDuplicate =
    !isUnchanged &&
    isSpaceNameTaken(spaceList?.spaces ?? [], trimmedName, spaceId);

  function handleSubmit() {
    if (updateMutation.isPending || isUnchanged || isDuplicate) {
      return;
    }
    const trimmed = field.validate();
    if (!trimmed) {
      return;
    }

    updateMutation.mutate(
      { spaceId, name: trimmed },
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
        id={NAME_INPUT_ID}
        value={field.name}
        onChange={field.handleChange}
        onEnter={handleSubmit}
        error={
          field.validationError ?? (isDuplicate ? t("space.name_taken") : null)
        }
        hasConflict={field.hasConflict}
      />

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={updateMutation.isPending || isUnchanged || isDuplicate}
        >
          {t("space.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
