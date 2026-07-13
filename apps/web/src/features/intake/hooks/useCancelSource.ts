import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useCancelSource() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.cancelDigestion, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
