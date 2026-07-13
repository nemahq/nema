import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useDeleteSource() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.delete, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
