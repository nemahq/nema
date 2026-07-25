import { trpc } from "@web/lib/trpc";

// 못 쓰는 모델(키 부재·미배선)은 서버가 bad_request로 거절 → 전역 토스트로 표면화된다.
export function useSetTaskModel() {
  const utils = trpc.useUtils();
  return trpc.dev.setTaskModel.useMutation({
    onSuccess: () => {
      utils.dev.getTaskModels.invalidate();
    },
  });
}
