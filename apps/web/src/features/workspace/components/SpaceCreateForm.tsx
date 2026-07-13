import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceNameField } from "./SpaceNameField";

const NAME_INPUT_ID = "space-create-name";

interface SpaceCreateFormProps {
  onOpenChange: (open: boolean) => void;
}

export function SpaceCreateForm({ onOpenChange }: SpaceCreateFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const field = useSpaceNameField();
  const createMutation = useCreateSpace();
  const isEmpty = field.name.trim() === "";

  function handleSubmit() {
    if (createMutation.isPending) {
      return;
    }
    const trimmed = field.validate();
    if (!trimmed) {
      return;
    }

    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: ({ spaceId }) => {
          onOpenChange(false);
          navigate({ to: "/space/$spaceId", params: { spaceId } });
        },
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
        error={field.validationError}
        hasConflict={field.hasConflict}
      />

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending || isEmpty}
        >
          {t("space.create_action")}
        </Button>
      </DialogFooter>
    </>
  );
}
