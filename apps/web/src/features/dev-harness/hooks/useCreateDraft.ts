import { trpc } from "@web/lib/trpc";

export function useCreateDraft() {
  const utils = trpc.useUtils();
  return trpc.draft.create.useMutation({
    onSuccess: () => {
      utils.draft.list.invalidate();
    },
  });
}
