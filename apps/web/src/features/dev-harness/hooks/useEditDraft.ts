import { trpc } from "@web/lib/trpc";

export function useEditDraft() {
  const utils = trpc.useUtils();
  return trpc.draft.edit.useMutation({
    onSuccess: () => {
      utils.draft.list.invalidate();
    },
  });
}
