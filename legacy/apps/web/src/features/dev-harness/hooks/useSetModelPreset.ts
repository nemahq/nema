import { trpc } from "@web/lib/trpc";

// 프리셋 교체는 tier resolve만 바꾼다 — getModelPreset만 갱신하면 된다.
// 에러 토스트는 전역 MutationCache가 처리한다(개별 onError 불필요).
export function useSetModelPreset() {
  const utils = trpc.useUtils();
  return trpc.dev.setModelPreset.useMutation({
    onSuccess: () => {
      utils.dev.getModelPreset.invalidate();
    },
  });
}
