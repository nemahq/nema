import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// source.deleteMany가 sourceId 배열을 프로시저 호출 하나로 받는다(구현은
// source-service.ts의 deleteSources) — 예전엔 이 훅이 source.delete를 sourceId
// 개수만큼 동시 호출해 tRPC 배치 링크가 URL에 프로시저명을 반복 이어붙였고, 그게
// Fastify maxParamLength를 넘겨 대량 삭제가 전체 실패하던 근본 원인이었다(#432).
export function useDeleteWaitingDrafts() {
  const utils = trpc.useUtils();
  const mutation = useMutation(trpc.source.deleteMany, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });

  return {
    deleteAll: (sourceIds: string[]) => mutation.mutateAsync({ sourceIds }),
    isDeleting: mutation.isPending,
    isDeletingAfterDelay: mutation.isPendingAfterDelay,
  };
}
