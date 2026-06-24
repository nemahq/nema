import { trpc } from "@web/lib/trpc";

// 확정은 source를 박제하고 추출을 깨운다 — 던진 글 목록도 함께 갱신한다.
export function useConfirmDraft() {
  const utils = trpc.useUtils();
  return trpc.draft.confirm.useMutation({
    onSuccess: () => {
      utils.draft.list.invalidate();
      utils.source.list.invalidate();
    },
  });
}
