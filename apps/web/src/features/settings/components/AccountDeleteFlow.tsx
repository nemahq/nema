import { useId, useState } from "react";
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
function isConfirmationEmailMatch(input: string, userEmail: string): boolean {
  return input.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

export function AccountDeleteFlow({
  userEmail,
  onBack,
}: AccountDeleteFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmEmailId = useId();
  const [confirmationInput, setConfirmationInput] = useState("");
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
  const canConfirm = isConfirmationEmailMatch(confirmationInput, userEmail);

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
              htmlFor={confirmEmailId}
              className="text-sm font-medium text-fg-primary"
            >
              {t("account.delete_confirm_email_label", { email: userEmail })}
            </label>
            <Input
              id={confirmEmailId}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={userEmail}
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
            !canConfirm || deleteMutation.isPending || isLoadingBlockers
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
