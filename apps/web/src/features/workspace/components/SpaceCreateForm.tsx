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
import { useTranslation } from "@web/lib/tolgee";

const NAME_INPUT_ID = "space-create-name";

interface SpaceCreateFormProps {
  onOpenChange: (open: boolean) => void;
}

export function SpaceCreateForm({ onOpenChange }: SpaceCreateFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const createMutation = useCreateSpace();

  function handleSubmit() {
    if (createMutation.isPending) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("space.name_required"));
      return;
    }

    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: ({ spaceId }) => {
          onOpenChange(false);
          navigate({ to: "/space/$spaceId", params: { spaceId } });
        },
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
        <DialogTitle>{t("space.create_title")}</DialogTitle>
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
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          {t("space.create_action")}
        </Button>
      </DialogFooter>
    </>
  );
}
