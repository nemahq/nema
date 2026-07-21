import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateReference() {
  const utils = trpc.useUtils();

  return useMutation(trpc.reference.update, {
    // reference.get만 반환(await)한다 — ReferenceEditor가 읽기 모드로 돌아가는 시점을
    // 이 재조회 완료에 맞추기 위함. list는 이 화면 전환과 무관해 fire-and-forget.
    onSuccess: (_data, variables) => {
      void utils.reference.list.invalidate();
      return utils.reference.get.invalidate({
        referenceId: variables.referenceId,
      });
    },
  });
}
