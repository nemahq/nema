import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 재추출은 이 원문을 초안 목록에서 없앨 수도(다이제스트가 나옴), 그대로 남길
// 수도(또 실패) 있다 — 응답만으로는 최종 상태를 알 수 없어 항상 목록을 다시
// 불러온다. 다이제스트 목록 화면에도 새 다이제스트가 나타나야 하니 함께 무효화한다.
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
