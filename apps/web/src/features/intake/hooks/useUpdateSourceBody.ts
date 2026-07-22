import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateSourceBody() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.updateBody, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
