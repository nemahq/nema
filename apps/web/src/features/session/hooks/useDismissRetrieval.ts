import { trpc } from "@web/lib/trpc";

export function useDismissRetrieval({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.dismissRetrieval.useMutation({
    onSuccess() {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, retrieval: null } : undefined,
      );
    },
  });
}
