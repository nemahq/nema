import { trpc } from "@web/lib/trpc";

export function useUpdateReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    onSuccess: () => {
      utils.digestReview.get.invalidate({ spaceId, number: changesetNumber });
      utils.source.listPending.invalidate();
    },
  });
}
