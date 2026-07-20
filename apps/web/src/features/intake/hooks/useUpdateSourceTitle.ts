import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateSourceTitle() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.updateTitle, {
    onSuccess: () => utils.source.listPending.invalidate(),
    // DraftTitleInput이 이미 인라인 Alert로 실패를 보여준다 — 전역 토스트까지
    // 중복 노출하지 않는다(useUpdateTopic 등과 같은 패턴).
    meta: { skipGlobalToast: true },
  });
}
