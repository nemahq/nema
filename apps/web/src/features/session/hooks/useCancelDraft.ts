import { trpc } from "@web/lib/trpc";

export function useCancelDraft({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.cancelDraft.useMutation({
    onMutate() {
      const prev = utils.session.get.getData({ sessionId });
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: null } : undefined,
      );
      return { prev };
    },
    onSuccess(data) {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: data.draft } : undefined,
      );
    },
    onError(_error, _vars, context) {
      if (context?.prev) {
        utils.session.get.setData({ sessionId }, context.prev);
      }
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
