import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// source.deleteMany가 sourceId 배열을 프로시저 호출 하나로 받는다(구현은
// source-service.ts의 deleteSources) — 개별 tRPC 호출로 sourceId 개수만큼
// source.delete를 부르면 배치 링크가 URL에 프로시저명을 반복 이어붙여 Fastify
// maxParamLength를 넘길 수 있다(#432).
export function useDeleteWaitingDrafts() {
  const utils = trpc.useUtils();
  const mutation = useMutation(trpc.source.deleteMany, {
    onSuccess: () => utils.source.list.invalidate(),
  });

  return {
    deleteAll: (sourceIds: string[]) => mutation.mutateAsync({ sourceIds }),
    isDeleting: mutation.isPending,
    isDeletingAfterDelay: mutation.isPendingAfterDelay,
  };
}
