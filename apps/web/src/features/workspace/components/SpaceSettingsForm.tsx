import { useState } from "react";
import { TRPCClientError } from "@trpc/client";

import { SPACE_NAME_MAX_LENGTH } from "@nema-io/shared";
import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@nema-io/weave";

import { useRenameSpace } from "@web/features/workspace/hooks/useRenameSpace";
import { useTranslation } from "@web/lib/tolgee";

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
  const [name, setName] = useState(spaceName);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const renameMutation = useRenameSpace();
  const isUnchanged = name.trim() === spaceName;

  function handleSubmit() {
    if (renameMutation.isPending || isUnchanged) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("space.name_required"));
      return;
    }

    renameMutation.mutate(
      { spaceId, name: trimmed },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (
            error instanceof TRPCClientError &&
            error.data?.code === "CONFLICT"
          ) {
            setHasConflict(true);
          }
        },
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.settings_title")}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={NAME_INPUT_ID}
          className="text-sm font-medium text-fg-primary"
        >
          {t("space.name_placeholder")}
        </label>
        <Input
          id={NAME_INPUT_ID}
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setValidationError(null);
            setHasConflict(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          maxLength={SPACE_NAME_MAX_LENGTH}
          aria-invalid={Boolean(validationError) || hasConflict}
        />
        <p
          role="alert"
          className={`text-xs ${validationError ? "text-status-error" : "text-transparent"}`}
        >
          {validationError ?? " "}
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={renameMutation.isPending || isUnchanged}
        >
          {t("space.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
