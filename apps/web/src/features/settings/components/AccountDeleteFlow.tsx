import { type ReactNode, Suspense, useId, useState } from "react";
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

interface AccountDeleteConfirmShellProps {
  onBack: () => void;
  cancelDisabled?: boolean;
  deleteDisabled: boolean;
  deleteLabel: string;
  onConfirmDelete?: () => void;
  children: ReactNode;
}

// 제목·경고 배너·footer는 차단 여부 조회와 무관하게 항상 같은 모양이라, 로딩 중
// fallback과 실제 화면이 이 shell을 그대로 공유한다 — 데이터 의존 영역(필드)만
// children으로 갈아끼운다.
function AccountDeleteConfirmShell({
  onBack,
  cancelDisabled,
  deleteDisabled,
  deleteLabel,
  onConfirmDelete,
  children,
}: AccountDeleteConfirmShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-lg font-semibold text-fg-primary">
        {t("account.delete_confirm_title")}
      </h2>

      <div className="mt-4 flex flex-1 flex-col gap-4">
        <Alert variant="error" icon={false}>
          {t("account.delete_confirm_description")}
        </Alert>
        {children}
      </div>

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack} disabled={cancelDisabled}>
          {t("account.delete_cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={onConfirmDelete}
          disabled={deleteDisabled}
        >
          {deleteLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface AccountDeleteConfirmFieldProps {
  userEmail: string;
  userDisplayName: string;
  confirmationTarget: string;
  confirmationInput: string;
  onConfirmationInputChange: (value: string) => void;
  disabled: boolean;
  mutationError: unknown;
}

function AccountDeleteConfirmField({
  userEmail,
  userDisplayName,
  confirmationTarget,
  confirmationInput,
  onConfirmationInputChange,
  disabled,
  mutationError,
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

      {mutationError &&
        (isPreconditionFailed(mutationError) ? (
          <Alert variant="warning">
            {t("account.delete_error_precondition")}
          </Alert>
        ) : (
          <Alert variant="error">{getErrorMessage(mutationError)}</Alert>
        ))}
    </>
  );
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
        mutationError={deleteMutation.error}
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
