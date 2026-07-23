import { trpc } from "@web/lib/trpc";

export function useUpdateTag() {
  const utils = trpc.useUtils();
  return trpc.tag.update.useMutation({
    onSuccess: () => utils.tag.list.invalidate(),
  });
}
