import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { SPACE_NAME_MAX_LENGTH } from "@nema-io/shared";
import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useRenameSpace } from "@web/features/workspace/hooks/useRenameSpace";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceModalFormProps {
  mode: "create" | "rename";
  spaceId?: string;
  spaceName?: string;
  onOpenChange: (open: boolean) => void;
}

export function SpaceModalForm({
  mode,
  spaceId,
  spaceName,
  onOpenChange,
}: SpaceModalFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState(spaceName ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const createMutation = useCreateSpace();
  const renameMutation = useRenameSpace();
  const mutation = mode === "create" ? createMutation : renameMutation;

  function handleSubmit() {
    if (mutation.isPending) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("space.name_required"));
      return;
    }

    if (mode === "create") {
      createMutation.mutate(
        { name: trimmed },
        {
          onSuccess: ({ spaceId }) => {
            onOpenChange(false);
            navigate({ to: "/space/$spaceId", params: { spaceId } });
          },
        },
      );
      return;
    }

    if (!spaceId) {
      return;
    }
    renameMutation.mutate(
      { spaceId, name: trimmed },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(mode === "create" ? "space.create_title" : "space.rename_title")}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setValidationError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          placeholder={t("space.name_placeholder")}
          maxLength={SPACE_NAME_MAX_LENGTH}
          aria-invalid={Boolean(validationError)}
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
        <Button onClick={handleSubmit} disabled={mutation.isPending}>
          {t(mode === "create" ? "space.create_action" : "space.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
