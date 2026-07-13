import { trpc } from "@web/lib/trpc";

export function useDeleteSource() {
  const utils = trpc.useUtils();

  return trpc.source.delete.useMutation({
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
