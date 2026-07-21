import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useAddReferenceTag() {
  const utils = trpc.useUtils();

  return useMutation(trpc.reference.addTag, {
    onSuccess: (_data, variables) =>
      utils.reference.get.invalidate({ referenceId: variables.referenceId }),
  });
}
