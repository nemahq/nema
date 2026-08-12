import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 삭제 확인 UI가 에러를 직접 다뤄야 하므로 전역 에러 토스트를 끈다
// (AccountDeleteFlow가 getErrorMessage로 직접 표시한다).
export function useDeleteAccount() {
  return useMutation(trpc.account.delete, {
    meta: { skipGlobalToast: true },
  });
}
