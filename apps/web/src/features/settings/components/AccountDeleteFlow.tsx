import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";

import { Alert, Button, DialogFooter, Skeleton } from "@nema-io/weave";

import {
  useAccountDeletionBlockersQuery,
  useDeleteAccount,
} from "@web/features/account";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

interface AccountDeleteFlowProps {
  onBack: () => void;
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "PRECONDITION_FAILED"
  );
}

export function AccountDeleteFlow({ onBack }: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const blockersQuery = useAccountDeletionBlockersQuery();
  const deleteMutation = useDeleteAccount();

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, {
      onSuccess: async () => {
        await supabase.auth.signOut();
        await navigate({ to: "/signin", search: { redirect: undefined } });
      },
      onError: (error) => {
        // 확인 화면을 보여준 뒤 다른 소유자 없는 워크스페이스가 새로 생긴 레이스 —
        // 차단 목록을 다시 조회해 게이팅 화면으로 되돌린다.
        if (isPreconditionFailed(error)) {
          blockersQuery.refetch();
        }
      },
    });
  }

  if (blockersQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (blockersQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{getErrorMessage(blockersQuery.error)}</Alert>
        <Button variant="ghost" onClick={onBack} className="self-start">
          {t("account.delete_blocked_back")}
        </Button>
      </div>
    );
  }

  const blockingCount = blockersQuery.data?.blockingWorkspaceIds.length ?? 0;

  if (blockingCount > 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-fg-primary">
          {t("account.delete_blocked_title")}
        </h2>
        <Alert variant="warning">
          {t("account.delete_blocked_description", { count: blockingCount })}
        </Alert>
        <Button variant="ghost" onClick={onBack} className="self-start">
          {t("account.delete_blocked_back")}
        </Button>
      </div>
    );
  }

  const mutationError = deleteMutation.error;

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-base font-semibold text-fg-primary">
        {t("account.delete_confirm_title")}
      </h2>

      <div className="mt-4 flex flex-1 flex-col gap-3">
        <Alert variant="error">{t("account.delete_confirm_description")}</Alert>

        {mutationError &&
          (isPreconditionFailed(mutationError) ? (
            <Alert variant="warning">
              {t("account.delete_error_precondition")}
            </Alert>
          ) : (
            <Alert variant="error">{getErrorMessage(mutationError)}</Alert>
          ))}
      </div>

      <DialogFooter className="mt-6">
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
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending
            ? t("account.delete_deleting")
            : t("account.delete_confirm_button")}
        </Button>
      </DialogFooter>
    </div>
  );
}
