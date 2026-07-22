import { Suspense, useState } from "react";
import * as Sentry from "@sentry/react";
import { useNavigate } from "@tanstack/react-router";

import { Alert, Button, DialogFooter, Skeleton, Text } from "@nema-io/weave";

import {
  isPreconditionFailed,
  useAccountDeletionBlockersSuspenseQuery,
  useDeleteAccount,
} from "@web/features/account";
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
  if (!error) {
    return null;
  }
  return isPreconditionFailed(error) ? "precondition" : "other";
}

interface AccountDeleteGateProps {
  onBack: () => void;
  onCleanupFailed: () => void;
}

function AccountDeleteGate({
  onBack,
  onCleanupFailed,
}: AccountDeleteGateProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUser();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [blockers, blockersQuery] = useAccountDeletionBlockersSuspenseQuery();
  const deleteMutation = useDeleteAccount();

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: async () => {
        try {
          await supabase.auth.signOut();
          await navigate({ to: "/signin", search: { redirect: undefined } });
        } catch (error) {
          Sentry.captureException(error);
          onCleanupFailed();
        }
      },
      onError: (error) => {
        // 확인 화면을 보여준 뒤, 다른 멤버가 있는 워크스페이스에서 내가 유일한
        // owner가 된 레이스 — 차단 목록을 다시 조회해 게이팅 화면으로 되돌린다.
        if (isPreconditionFailed(error)) {
          blockersQuery.refetch();
        }
      },
    });
  }

  const blockingCount = blockers.blockingWorkspaceIds.length;

  if (blockingCount > 0) {
    return (
      <div className="flex h-full flex-col">
        <Text as="h2" size="lg" weight="semibold">
          {t("account.delete_blocked_title")}
        </Text>
        <div className="mt-4 flex flex-1 flex-col gap-4">
          <Alert variant="warning">
            {t("account.delete_blocked_description", { count: blockingCount })}
          </Alert>
        </div>
        <DialogFooter className="mt-6 border-t border-border pt-4">
          <Button variant="ghost" onClick={onBack}>
            {t("common.back")}
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
      deleteDisabled={
        !canConfirm || deleteMutation.isPending || blockersQuery.isFetching
      }
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

export function AccountDeleteFlow({ onBack }: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const [postDeleteCleanupFailed, setPostDeleteCleanupFailed] = useState(false);

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

  return (
    <Suspense
      fallback={
        <AccountDeleteConfirmShell
          onBack={onBack}
          deleteDisabled
          deleteLabel={t("account.delete_confirm_button")}
        >
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full" />
          </div>
        </AccountDeleteConfirmShell>
      }
    >
      <AccountDeleteGate
        onBack={onBack}
        onCleanupFailed={() => setPostDeleteCleanupFailed(true)}
      />
    </Suspense>
  );
}
