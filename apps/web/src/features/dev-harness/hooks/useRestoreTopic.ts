import { trpc } from "@web/lib/trpc";

// 실패는 TopicRow가 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useRestoreTopic() {
  const utils = trpc.useUtils();
  return trpc.topic.restore.useMutation({
    meta: { skipGlobalToast: true },
    onSuccess: () => utils.topic.list.invalidate(),
  });
}
