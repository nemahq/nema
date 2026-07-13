import { useState } from "react";
import { TRPCClientError } from "@trpc/client";

import { useTranslation } from "@web/lib/tolgee";

export function useSpaceNameField(initialValue = "") {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValue);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  function handleChange(value: string) {
    setName(value);
    setValidationError(null);
    setHasConflict(false);
  }

  function validate(): string | null {
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("space.name_required"));
      return null;
    }
    return trimmed;
  }

  function markConflictIfNameTaken(error: unknown) {
    if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
      setHasConflict(true);
    }
  }

  return {
    name,
    handleChange,
    validationError,
    hasConflict,
    validate,
    markConflictIfNameTaken,
  };
}
