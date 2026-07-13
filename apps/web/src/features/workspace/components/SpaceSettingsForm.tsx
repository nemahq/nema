import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useRenameSpace } from "@web/features/workspace/hooks/useRenameSpace";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";
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
  const { data: bootstrap } = useWorkspaceBootstrapQuery();
  const field = useSpaceNameField(spaceName);
  const renameMutation = useRenameSpace();
  const trimmedName = field.name.trim();
  const isUnchanged = trimmedName === spaceName;
  const isDuplicate =
    !isUnchanged &&
    isSpaceNameTaken(bootstrap?.spaces ?? [], trimmedName, spaceId);

  function handleSubmit() {
    if (renameMutation.isPending || isUnchanged || isDuplicate) {
      return;
    }
    const trimmed = field.validate();
    if (!trimmed) {
      return;
    }

    renameMutation.mutate(
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
          disabled={renameMutation.isPending || isUnchanged || isDuplicate}
        >
          {t("space.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
