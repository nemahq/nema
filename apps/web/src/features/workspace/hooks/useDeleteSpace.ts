import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useDeleteSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.space.delete, {
    onSuccess() {
      utils.space.list.invalidate();
      // 대기 초안이 이동되거나(다른 Space로 UPDATE) "함께 삭제"로 cascade
      // DELETE될 수 있다 — Realtime의 sources 구독은 UPDATE만 듣고 DELETE는
      // 안 듣기 때문에(useRealtimeInvalidation), cascade 삭제 경로는 이 직접
      // invalidate 없이는 실행한 본인 탭에서도 반영되지 않는다.
      utils.source.listPending.invalidate();
    },
  });
}
