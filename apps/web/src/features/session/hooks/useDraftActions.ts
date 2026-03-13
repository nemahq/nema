import { trpc } from "@web/lib/trpc";

export function useDraftActions({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  function onDraftMutationSuccess(data: { draft: unknown }) {
    utils.session.get.setData({ sessionId }, (old) =>
      old ? { ...old, draft: data.draft as typeof old.draft } : undefined,
    );
  }

  function onDraftMutationSettled() {
    utils.message.list.invalidate({ sessionId });
  }

  const save = trpc.message.saveDraft.useMutation({
    onSuccess: onDraftMutationSuccess,
    onSettled: onDraftMutationSettled,
  });

  const cancel = trpc.message.cancelDraft.useMutation({
    onSuccess: onDraftMutationSuccess,
    onSettled: onDraftMutationSettled,
  });

  return { save, cancel };
}
