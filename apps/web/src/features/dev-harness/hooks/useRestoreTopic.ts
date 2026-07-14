import { trpc } from "@web/lib/trpc";

export function useRestoreTopic() {
  const utils = trpc.useUtils();
  return trpc.topic.restore.useMutation({
    onSuccess: () => utils.topic.list.invalidate(),
  });
}
