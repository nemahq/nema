import { trpc } from "@web/lib/trpc";

export function useDismissRetrieval({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.dismissRetrieval.useMutation({
    async onMutate() {
      await utils.session.get.cancel({ sessionId });
      const prev = utils.session.get.getData({ sessionId });
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, retrieval: null } : undefined,
      );
      return { prev };
    },
    onError(_error, _vars, context) {
      if (context?.prev) {
        utils.session.get.setData({ sessionId }, context.prev);
      }
    },
    onSettled() {
      utils.session.get.invalidate({ sessionId });
    },
  });
}
