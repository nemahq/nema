import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useRemoveReferenceTag() {
  const utils = trpc.useUtils();

  return useMutation(trpc.reference.removeTag, {
    onSuccess: (_data, variables) =>
      utils.reference.get.invalidate({ referenceId: variables.referenceId }),
  });
}
