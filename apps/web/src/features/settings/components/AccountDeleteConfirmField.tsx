import {
  Alert,
  FormControl,
  FormField,
  FormLabel,
  Input,
} from "@nema-io/weave";

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
  const user = useUser();
  const hasEmail = user.email.trim().length > 0;
  const confirmationTarget = resolveConfirmationTarget(
    user.email,
    user.displayName,
  );

  return (
    <>
      <FormField>
        <FormLabel
          color={disabled ? "quaternary" : "primary"}
          className="leading-normal"
        >
          {t("common.delete_confirm_instruction", {
            value: hasEmail ? user.email : user.displayName,
          })}
        </FormLabel>
        <FormControl>
          <Input
            value={confirmationInput}
            onChange={(e) => onConfirmationInputChange(e.target.value)}
            placeholder={confirmationTarget}
            autoComplete="off"
            disabled={disabled}
          />
        </FormControl>
      </FormField>

      {/* 계정 삭제 API 실패는 이 입력값이 유효한지와 무관한 페이지 레벨 실패라
          FormMessage(필드 힌트)가 아니라 Alert(눈에 띄는 배너)로 남긴다. */}
      {error === "other" && errorMessage && (
        <Alert variant="error">{errorMessage}</Alert>
      )}
    </>
  );
}
