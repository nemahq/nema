import { trpc } from "@web/lib/trpc";

export function useDraftActions({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  function onDraftMutationSettled() {
    utils.message.list.invalidate({ sessionId });
  }

  const save = trpc.message.saveDraft.useMutation({
    onSuccess(data) {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: data.draft } : undefined,
      );
    },
    onSettled: onDraftMutationSettled,
  });

  const cancel = trpc.message.cancelDraft.useMutation({
    onSuccess(data) {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: data.draft } : undefined,
      );
    },
    onSettled: onDraftMutationSettled,
  });

  return { save, cancel };
}
