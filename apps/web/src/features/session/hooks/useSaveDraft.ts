import { trpc } from "@web/lib/trpc";

export function useSaveDraft({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.saveJob.enqueue.useMutation({
    onSuccess() {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: null } : undefined,
      );
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
