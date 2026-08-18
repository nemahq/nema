import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 재추출은 실패한 초안에 붙는 재시도 액션이다. 성공하면 원문이 초안 탭에서
// 빠지고 다이제스트 목록에 나타나므로(useDeleteSource와 같은 이유로) 두 목록
// 다 무효화한다. 실패하면 값이 도로 failed로 남을 뿐이라(processing → failed)
// 무효화하지 않아도 화면이 틀리지 않는다.
export function useReExtractSource() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.reExtract, {
    onSuccess() {
      return Promise.all([
        utils.source.list.invalidate(),
        utils.source.listWithDigests.invalidate(),
      ]);
    },
  });
}
