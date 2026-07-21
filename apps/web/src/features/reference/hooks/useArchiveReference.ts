import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useArchiveReference() {
  const utils = trpc.useUtils();

  return useMutation(trpc.reference.archive, {
    onSuccess: (_data, variables) => {
      void utils.reference.list.invalidate();
      void utils.reference.get.invalidate({
        referenceId: variables.referenceId,
      });
    },
  });
}
