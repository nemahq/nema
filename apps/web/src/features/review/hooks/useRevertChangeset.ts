import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useRevertChangeset() {
  const utils = trpc.useUtils();
  return useMutation(trpc.changeset.revert, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
    },
  });
}
