import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 가리면 목록에서 빠지고 뜻으로 찾기에서도 빠진다 — 두 경로를 함께 무효화한다.
// getRelations도 같이 무효화한다 — 안 그러면 지운 다이제스트를 가리키는 관계
// 줄이 staleTime 동안 다른 다이제스트의 상세에 죽은 칩으로 남는다.
export function useDeleteDigest() {
  const utils = trpc.useUtils();

  return useMutation(trpc.digest.delete, {
    onSuccess() {
      return Promise.all([
        utils.source.listWithDigests.invalidate(),
        utils.digest.search.invalidate(),
        utils.digest.getRelations.invalidate(),
      ]);
    },
  });
}
