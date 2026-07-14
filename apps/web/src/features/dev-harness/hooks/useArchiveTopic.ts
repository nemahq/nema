import { trpc } from "@web/lib/trpc";

export function useArchiveTopic() {
  const utils = trpc.useUtils();
  return trpc.topic.archive.useMutation({
    onSuccess: () => utils.topic.list.invalidate(),
  });
}
