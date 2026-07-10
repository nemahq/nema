import { useId, useState } from "react";
import * as Sentry from "@sentry/react";
import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";

import { Alert, Button, DialogFooter, Input, Skeleton } from "@nema-io/weave";

import {
  useAccountDeletionBlockersQuery,
  useDeleteAccount,
} from "@web/features/account";
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

// 삭제 확인은 버튼 클릭만이 아니라 본인 이메일 타이핑까지 요구한다(위험 액션
// 확인 강도를 타이핑 확인으로 올린 PM 결정, design-decisions-log 참고).
// 이메일은 대소문자를 구분하지 않는 게 일반적인 이메일 비교 관례라 toLowerCase
// 비교로 맞추고, 앞뒤 공백은 트리밍한다.
function isConfirmationMatch(input: string, target: string): boolean {
  return input.trim().toLowerCase() === target.trim().toLowerCase();
}

export function AccountDeleteFlow({
  userEmail,
  userDisplayName,
  onBack,
}: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmFieldId = useId();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [postDeleteCleanupFailed, setPostDeleteCleanupFailed] = useState(false);
  const blockersQuery = useAccountDeletionBlockersQuery();
  const deleteMutation = useDeleteAccount();

  // 이메일 없는 계정(전화번호 인증 등)은 displayName으로 대체 — 안 그러면
  // 확인이 영원히 불가능한 채로 버튼만 막혀버린다.
  const hasEmail = userEmail.trim().length > 0;
  const confirmationTarget = hasEmail ? userEmail : userDisplayName;

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

  if (blockersQuery.isError) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col gap-4">
          <Alert variant="error">{getErrorMessage(blockersQuery.error)}</Alert>
        </div>
        <DialogFooter className="mt-6 border-t border-border pt-4">
          <Button variant="ghost" onClick={onBack}>
            {t("account.delete_blocked_back")}
          </Button>
          <Button onClick={() => blockersQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const isLoadingBlockers = blockersQuery.isLoading;
  const blockingCount = blockersQuery.data?.blockingWorkspaceIds.length ?? 0;

  // 아직 로딩 중일 땐 게이팅 여부를 몰라 blocked 화면으로 못 넘어간다 — 그동안은
  // confirm 화면을 낙관적으로 먼저 보여주고, 이메일 확인 폼 자리만 스켈레톤으로
  // 채운다(제목·경고·버튼은 로딩 여부와 무관하게 항상 같은 모양이라서).
  if (!isLoadingBlockers && blockingCount > 0) {
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
  const canConfirm =
    confirmationTarget.trim().length > 0 &&
    isConfirmationMatch(confirmationInput, confirmationTarget);

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-lg font-semibold text-fg-primary">
        {t("account.delete_confirm_title")}
      </h2>

      <div className="mt-4 flex flex-1 flex-col gap-4">
        <Alert variant="error">{t("account.delete_confirm_description")}</Alert>

        {isLoadingBlockers ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={confirmFieldId}
              className="text-sm font-medium text-fg-primary"
            >
              {hasEmail
                ? t("account.delete_confirm_email_label", {
                    email: userEmail,
                  })
                : t("account.delete_confirm_name_label", {
                    name: userDisplayName,
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
        )}

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
          {deleteMutation.isPending
            ? t("account.delete_deleting")
            : t("account.delete_confirm_button")}
        </Button>
      </DialogFooter>
    </div>
  );
}
