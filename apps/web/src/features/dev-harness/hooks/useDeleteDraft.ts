import { trpc } from "@web/lib/trpc";

export function useDeleteDraft() {
  const utils = trpc.useUtils();
  return trpc.draft.delete.useMutation({
    onSuccess: () => {
      utils.draft.list.invalidate();
    },
  });
}
