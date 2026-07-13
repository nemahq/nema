import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useReassignSourceSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.reassignSpace, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
