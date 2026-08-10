import { trpc } from "@web/lib/trpc";

// 확정은 원문을 active로 밀고 추출을 깨운다 — 대기 원문에서 빠지고 던진 글 목록에 든다.
export function useConfirmReview() {
  const utils = trpc.useUtils();
  return trpc.digestReview.confirm.useMutation({
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.source.list.invalidate();
    },
  });
}
