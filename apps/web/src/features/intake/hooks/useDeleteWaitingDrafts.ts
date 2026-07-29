import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// source.deleteMany가 sourceId 배열을 프로시저 호출 하나로 받는다(구현은
// source-service.ts의 deleteSources) — 예전엔 이 훅이 source.delete를 sourceId
// 개수만큼 동시 호출해 tRPC 배치 링크가 URL에 프로시저명을 반복 이어붙였고, 그게
// Fastify maxParamLength를 넘겨 대량 삭제가 전체 실패하던 근본 원인이었다(#432).
export function useDeleteWaitingDrafts() {
  const utils = trpc.useUtils();
  const mutation = useMutation(trpc.source.deleteMany, {
    // listPending만 무효화하면, 삭제 직전 정리가 끝나 changeset이 막 열린
    // 소스가 섞여 있던 경우(동시성 충돌로 개별 삭제는 건너뜀) 확인 대기 뱃지가
    // 갱신 안 된 채 남는다 — space.list(뱃지 카운트)·changeset.listChangesets도
    // 함께 무효화해 실제 상태와 맞춘다.
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.space.list.invalidate();
      utils.changeset.listChangesets.invalidate();
    },
  });

  return {
    deleteAll: (sourceIds: string[]) => mutation.mutateAsync({ sourceIds }),
    isDeleting: mutation.isPending,
    isDeletingAfterDelay: mutation.isPendingAfterDelay,
  };
}
