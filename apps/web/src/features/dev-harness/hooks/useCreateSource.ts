import { trpc } from "@web/lib/trpc";

// 원문 박제 — 대기 원본 목록과 던진 글 목록을 함께 갱신한다.
export function useCreateSource() {
  const utils = trpc.useUtils();
  return trpc.source.create.useMutation({
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.source.list.invalidate();
    },
  });
}
