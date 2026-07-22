import { trpc } from "@web/lib/trpc";

export function useUpdateTopic() {
  const utils = trpc.useUtils();
  return trpc.topic.update.useMutation({
    onSuccess: () => utils.topic.list.invalidate(),
  });
}
