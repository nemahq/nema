import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 가리면 목록에서 빠지고 뜻으로 찾기에서도 빠진다 — 두 경로를 함께 무효화한다.
export function useDeleteDigest() {
  const utils = trpc.useUtils();

  return useMutation(trpc.digest.delete, {
    onSuccess() {
      return Promise.all([
        utils.source.listWithDigests.invalidate(),
        utils.digest.search.invalidate(),
      ]);
    },
  });
}
