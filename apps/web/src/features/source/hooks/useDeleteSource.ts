import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 삭제는 원문이 등장하는 모든 목록(초안 화면·다이제스트 목록 화면)에 영향을 준다 —
// 소비처가 어느 화면이든 둘 다 무효화해서 드리프트를 막는다.
export function useDeleteSource() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.delete, {
    onSuccess() {
      return Promise.all([
        utils.source.list.invalidate(),
        utils.source.listWithDigests.invalidate(),
      ]);
    },
  });
}
