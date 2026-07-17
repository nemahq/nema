import { useId } from "react";

import { Alert, Input } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

type AccountDeleteError = "precondition" | "other" | null;

interface AccountDeleteConfirmFieldProps {
  userEmail: string;
  userDisplayName: string;
  confirmationTarget: string;
  confirmationInput: string;
  onConfirmationInputChange: (value: string) => void;
  disabled: boolean;
  error: AccountDeleteError;
  errorMessage: string | null;
}

export function AccountDeleteConfirmField({
  userEmail,
  userDisplayName,
  confirmationTarget,
  confirmationInput,
  onConfirmationInputChange,
  disabled,
  error,
  errorMessage,
}: AccountDeleteConfirmFieldProps) {
  const { t } = useTranslation();
  const confirmFieldId = useId();
  const hasEmail = userEmail.trim().length > 0;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={confirmFieldId}
          className="text-sm font-medium text-fg-primary"
        >
          {hasEmail
            ? t("account.delete_confirm_email_label", { email: userEmail })
            : t("account.delete_confirm_name_label", {
                name: userDisplayName,
              })}
        </label>
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
