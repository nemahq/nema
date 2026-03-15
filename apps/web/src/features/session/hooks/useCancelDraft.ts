import { trpc } from "@web/lib/trpc";

export function useCancelDraft({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.cancelDraft.useMutation({
    onSuccess(data) {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: data.draft } : undefined,
      );
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
