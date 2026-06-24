import { trpc } from "@web/lib/trpc";

// 러프 말뭉치 → 제목·정제본문·주제 제안 초안. 결과는 인박스에 대기로 쌓인다.
export function useAssistDraft() {
  const utils = trpc.useUtils();
  return trpc.draft.assist.useMutation({
    onSuccess: () => {
      utils.draft.list.invalidate();
    },
  });
}
