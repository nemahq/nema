import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useConfirmReview() {
  const utils = trpc.useUtils();
  return useMutation(trpc.digestReview.confirm, {
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.source.list.invalidate();
      utils.changeset.listChangesets.invalidate();
    },
  });
}
