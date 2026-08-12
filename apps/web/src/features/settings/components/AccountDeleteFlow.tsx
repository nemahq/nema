import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Alert, Button, DialogFooter, Text } from "@nema-io/weave";

import { useDeleteAccount } from "@web/features/account";
import {
  type AccountDeleteError,
  canConfirmAccountDeletion,
  resolveConfirmationTarget,
} from "@web/features/settings/confirmAccountDeletion";
import { useUser } from "@web/lib/auth";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

import { AccountDeleteConfirmField } from "./AccountDeleteConfirmField";
import { AccountDeleteConfirmShell } from "./AccountDeleteConfirmShell";

interface AccountDeleteFlowProps {
  onBack: () => void;
}

function deleteErrorKind(error: unknown): AccountDeleteError {
  return error ? "other" : null;
}

export function AccountDeleteFlow({ onBack }: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUser();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [postDeleteCleanupFailed, setPostDeleteCleanupFailed] = useState(false);
  const deleteMutation = useDeleteAccount();

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: async () => {
        try {
          await supabase.auth.signOut();
          await navigate({ to: "/signin", search: { redirect: undefined } });
        } catch {
          setPostDeleteCleanupFailed(true);
        }
      },
    });
  }

  if (postDeleteCleanupFailed) {
    return (
      <div className="flex h-full flex-col">
        <Text as="h2" size="lg" weight="semibold">
          {t("account.delete_confirm_title")}
        </Text>
        <div className="mt-4 flex flex-1 flex-col gap-4">
          <Alert variant="warning">{t("account.delete_cleanup_failed")}</Alert>
        </div>
        <DialogFooter className="mt-6 border-t border-border pt-4">
          <Button onClick={() => (window.location.href = "/signin")}>
            {t("account.delete_go_to_signin")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const confirmationTarget = resolveConfirmationTarget(
    user.email,
    user.displayName,
  );
  const canConfirm = canConfirmAccountDeletion(
    confirmationInput,
    confirmationTarget,
  );
  const mutationError = deleteMutation.error;
  const error = deleteErrorKind(mutationError);

  return (
    <AccountDeleteConfirmShell
      onBack={onBack}
      cancelDisabled={deleteMutation.isPending}
      deleteDisabled={!canConfirm || deleteMutation.isPending}
      deleteLabel={
        deleteMutation.isPendingAfterDelay
          ? t("account.delete_deleting")
          : t("account.delete_confirm_button")
      }
      onConfirmDelete={handleConfirmDelete}
    >
      <AccountDeleteConfirmField
        confirmationInput={confirmationInput}
        onConfirmationInputChange={setConfirmationInput}
        disabled={deleteMutation.isPending}
        error={error}
        errorMessage={mutationError ? getErrorMessage(mutationError) : null}
      />
    </AccountDeleteConfirmShell>
  );
}
