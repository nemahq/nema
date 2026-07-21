import { useId } from "react";

import { Alert, Input, Text } from "@nema-io/weave";

import {
  type AccountDeleteError,
  resolveConfirmationTarget,
} from "@web/features/settings/confirmAccountDeletion";
import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

interface AccountDeleteConfirmFieldProps {
  confirmationInput: string;
  onConfirmationInputChange: (value: string) => void;
  disabled: boolean;
  error: AccountDeleteError;
  errorMessage: string | null;
}

export function AccountDeleteConfirmField({
  confirmationInput,
  onConfirmationInputChange,
  disabled,
  error,
  errorMessage,
}: AccountDeleteConfirmFieldProps) {
  const { t } = useTranslation();
  const confirmFieldId = useId();
  const user = useUser();
  const hasEmail = user.email.trim().length > 0;
  const confirmationTarget = resolveConfirmationTarget(
    user.email,
    user.displayName,
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Text as="label" htmlFor={confirmFieldId} size="sm" bold>
          {t("common.delete_confirm_instruction", {
            value: hasEmail ? user.email : user.displayName,
          })}
        </Text>
        <Input
          id={confirmFieldId}
          value={confirmationInput}
          onChange={(e) => onConfirmationInputChange(e.target.value)}
          placeholder={confirmationTarget}
          autoComplete="off"
          disabled={disabled}
        />
      </div>

      {error === "precondition" && (
        <Alert variant="warning">
          {t("account.delete_error_precondition")}
        </Alert>
      )}
      {error === "other" && errorMessage && (
        <Alert variant="error">{errorMessage}</Alert>
      )}
    </>
  );
}
