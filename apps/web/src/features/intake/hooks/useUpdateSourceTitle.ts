import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// EditSourceTitleDialog가 이미 인라인 Alert로 에러를 보여주므로, 전역 토스트는 중복이라 끈다.
export function useUpdateSourceTitle() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.updateTitle, {
    meta: { skipGlobalToast: true },
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
