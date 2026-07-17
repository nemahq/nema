import { Suspense, useState } from "react";
import * as Sentry from "@sentry/react";
import { useNavigate } from "@tanstack/react-router";

import { Alert, Button, DialogFooter, Skeleton } from "@nema-io/weave";

import {
  useAccountDeletionBlockersSuspenseQuery,
  useDeleteAccount,
} from "@web/features/account";
import {
  canConfirmAccountDeletion,
  isPreconditionFailed,
  resolveConfirmationTarget,
} from "@web/features/settings/confirmAccountDeletion";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

import { AccountDeleteConfirmField } from "./AccountDeleteConfirmField";
import { AccountDeleteConfirmShell } from "./AccountDeleteConfirmShell";

interface AccountDeleteFlowProps {
  userEmail: string;
  userDisplayName: string;
  onBack: () => void;
}

function deleteErrorKind(error: unknown): "precondition" | "other" | null {
  if (!error) {
    return null;
  }
  return isPreconditionFailed(error) ? "precondition" : "other";
}

interface AccountDeleteGateProps {
  userEmail: string;
  userDisplayName: string;
  onBack: () => void;
  onCleanupFailed: () => void;
}

function AccountDeleteGate({
  userEmail,
  userDisplayName,
  onBack,
  onCleanupFailed,
}: AccountDeleteGateProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        <h2 className="text-lg font-semibold text-fg-primary">
          {t("account.delete_blocked_title")}
        </h2>
        <div className="mt-4 flex flex-1 flex-col gap-4">
          <Alert variant="warning">
            {t("account.delete_blocked_description", { count: blockingCount })}
          </Alert>
        </div>
        <DialogFooter className="mt-6 border-t border-border pt-4">
          <Button variant="ghost" onClick={onBack}>
            {t("account.delete_blocked_back")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const confirmationTarget = resolveConfirmationTarget(
    userEmail,
    userDisplayName,
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
        userEmail={userEmail}
        userDisplayName={userDisplayName}
        confirmationTarget={confirmationTarget}
        confirmationInput={confirmationInput}
        onConfirmationInputChange={setConfirmationInput}
        disabled={deleteMutation.isPending}
        error={error}
        errorMessage={mutationError ? getErrorMessage(mutationError) : null}
      />
    </AccountDeleteConfirmShell>
  );
}

export function AccountDeleteFlow({
  userEmail,
  userDisplayName,
  onBack,
}: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const [postDeleteCleanupFailed, setPostDeleteCleanupFailed] = useState(false);

  if (postDeleteCleanupFailed) {
    return (
      <div className="flex h-full flex-col">
        <h2 className="text-lg font-semibold text-fg-primary">
          {t("account.delete_confirm_title")}
        </h2>
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
        userEmail={userEmail}
        userDisplayName={userDisplayName}
        onBack={onBack}
        onCleanupFailed={() => setPostDeleteCleanupFailed(true)}
      />
    </Suspense>
  );
}
