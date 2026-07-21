import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useArchiveReference() {
  const utils = trpc.useUtils();

  return useMutation(trpc.reference.archive, {
    // reference.get만 반환(await)한다 — isArchived가 갱신돼야 더보기 메뉴가 실제로
    // 사라지므로, 그 전까지는 mutation을 pending으로 붙들어 재클릭을 막는다.
    onSuccess: (_data, variables) => {
      void utils.reference.list.invalidate();
      return utils.reference.get.invalidate({
        referenceId: variables.referenceId,
      });
    },
  });
}
