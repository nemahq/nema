import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";

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

type SpaceModalFormProps =
  | { mode: "create"; onOpenChange: (open: boolean) => void }
  | {
      mode: "rename";
      spaceId: string;
      spaceName: string;
      onOpenChange: (open: boolean) => void;
    };

export function SpaceModalForm(props: SpaceModalFormProps) {
  const { onOpenChange } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState(
    props.mode === "rename" ? props.spaceName : "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const createMutation = useCreateSpace();
  const renameMutation = useRenameSpace();
  const mutation = props.mode === "create" ? createMutation : renameMutation;

  function markConflictIfNameTaken(error: unknown) {
    if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
      setHasConflict(true);
    }
  }

  function handleSubmit() {
    if (mutation.isPending) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("space.name_required"));
      return;
    }

    if (props.mode === "create") {
      createMutation.mutate(
        { name: trimmed },
        {
          onSuccess: ({ spaceId }) => {
            onOpenChange(false);
            navigate({ to: "/space/$spaceId", params: { spaceId } });
          },
          onError: markConflictIfNameTaken,
        },
      );
      return;
    }

    renameMutation.mutate(
      { spaceId: props.spaceId, name: trimmed },
      {
        onSuccess: () => onOpenChange(false),
        onError: markConflictIfNameTaken,
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(
            props.mode === "create"
              ? "space.create_title"
              : "space.rename_title",
          )}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Input
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
          placeholder={t("space.name_placeholder")}
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
        <Button onClick={handleSubmit} disabled={mutation.isPending}>
          {t(props.mode === "create" ? "space.create_action" : "space.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
