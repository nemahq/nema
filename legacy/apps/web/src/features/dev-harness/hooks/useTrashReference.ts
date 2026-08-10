import { trpc } from "@web/lib/trpc";

// 실패는 ReferenceRow가 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useTrashReference() {
  const utils = trpc.useUtils();
  return trpc.reference.trash.useMutation({
    meta: { skipGlobalToast: true },
    onSuccess: () => utils.reference.list.invalidate(),
  });
}
