import { useSaveQueue } from "@web/features/session/contexts/SaveQueueContext";
import { trpc } from "@web/lib/trpc";

export function useSaveDraft({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const { addJob } = useSaveQueue();

  return trpc.saveJob.enqueue.useMutation({
    onSuccess(job) {
      addJob(job);
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: null } : undefined,
      );
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
