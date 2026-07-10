import { trackEvent } from "@web/lib/posthog/trackEvent";
import { trpc } from "@web/lib/trpc";

// 삭제 확인 UI가 PRECONDITION_FAILED(레이스로 소유권 이전 필요 상태가 된 경우)를
// 직접 안내해야 하므로, 전역 에러 토스트 대신 호출부가 에러를 직접 다룬다.
export function useDeleteAccount() {
  return trpc.account.delete.useMutation({
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      trackEvent("account.delete");
    },
  });
}
