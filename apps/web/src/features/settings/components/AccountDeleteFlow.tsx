import { Suspense, useId, useState } from "react";
import * as Sentry from "@sentry/react";
import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";

import { Alert, Button, DialogFooter, Input, Skeleton } from "@nema-io/weave";

import {
  useAccountDeletionBlockersSuspenseQuery,
  useDeleteAccount,
} from "@web/features/account";
import {
  canConfirmAccountDeletion,
  resolveConfirmationTarget,
} from "@web/features/settings/confirmAccountDeletion";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

interface AccountDeleteFlowProps {
  userEmail: string;
  userDisplayName: string;
  onBack: () => void;
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "PRECONDITION_FAILED"
  );
}

function AccountDeleteContent({
  userEmail,
  userDisplayName,
  onBack,
}: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmFieldId = useId();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [postDeleteCleanupFailed, setPostDeleteCleanupFailed] = useState(false);
  const [blockers, blockersQuery] = useAccountDeletionBlockersSuspenseQuery();
  const deleteMutation = useDeleteAccount();

  const hasEmail = userEmail.trim().length > 0;
  const confirmationTarget = resolveConfirmationTarget(
    userEmail,
    userDisplayName,
  );

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: async () => {
        try {
          await supabase.auth.signOut();
          await navigate({ to: "/signin", search: { redirect: undefined } });
        } catch (error) {
          Sentry.captureException(error);
          setPostDeleteCleanupFailed(true);
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

  const mutationError = deleteMutation.error;
  const canConfirm = canConfirmAccountDeletion(
    confirmationInput,
    confirmationTarget,
  );

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-lg font-semibold text-fg-primary">
        {t("account.delete_confirm_title")}
      </h2>

      <div className="mt-4 flex flex-1 flex-col gap-4">
        <Alert variant="error" icon={false}>
          {t("account.delete_confirm_description")}
        </Alert>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={confirmFieldId}
            className="text-sm font-medium text-fg-primary"
          >
            {t("common.delete_confirm_instruction", {
              value: hasEmail ? userEmail : userDisplayName,
            })}
          </label>
          <Input
            id={confirmFieldId}
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            placeholder={confirmationTarget}
            autoComplete="off"
            disabled={deleteMutation.isPending}
          />
        </div>

        {mutationError &&
          (isPreconditionFailed(mutationError) ? (
            <Alert variant="warning">
              {t("account.delete_error_precondition")}
            </Alert>
          ) : (
            <Alert variant="error">{getErrorMessage(mutationError)}</Alert>
          ))}
      </div>

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={deleteMutation.isPending}
        >
          {t("account.delete_cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={handleConfirmDelete}
          disabled={
            !canConfirm || deleteMutation.isPending || blockersQuery.isFetching
          }
        >
          {deleteMutation.isPendingAfterDelay
            ? t("account.delete_deleting")
            : t("account.delete_confirm_button")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function AccountDeleteFlow(props: AccountDeleteFlowProps) {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col">
          <h2 className="text-lg font-semibold text-fg-primary">
            {t("account.delete_confirm_title")}
          </h2>
          <div className="mt-4 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      }
    >
      <AccountDeleteContent {...props} />
    </Suspense>
  );
}
