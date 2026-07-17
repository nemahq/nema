import * as Sentry from "@sentry/react";

import { isPreconditionFailed } from "@web/features/account/accountErrors";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 삭제 확인 UI가 PRECONDITION_FAILED(레이스로 소유권 이전 필요 상태가 된 경우)를
// 직접 안내해야 하므로, 전역 에러 토스트 대신 호출부가 에러를 직접 다룬다. Sentry
// 캡처도 meta.reportToSentry(무조건 캡처)에 맡기지 않고 여기서 직접 판별한다 —
// precondition은 서버가 EXPECTED_DOMAIN_CODES로 분류해 캡처하지 않는 정상적인
// 거부라, 클라이언트도 같은 기준으로 노이즈를 걸러야 한다.
export function useDeleteAccount() {
  return useMutation(trpc.account.delete, {
    meta: { skipGlobalToast: true },
    onError: (error) => {
      if (!isPreconditionFailed(error)) {
        Sentry.captureException(error);
      }
    },
    onSuccess: () => {
      trackEvent("account.delete");
    },
  });
}
