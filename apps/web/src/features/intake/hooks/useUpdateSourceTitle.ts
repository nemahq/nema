import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateSourceTitle() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.updateTitle, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
