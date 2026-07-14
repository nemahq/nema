import { trpc } from "@web/lib/trpc";

export function useUpdateReview(changesetId: string) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    onSuccess: () => {
      utils.digestReview.get.invalidate({ changesetId });
      utils.source.listPending.invalidate();
    },
  });
}
