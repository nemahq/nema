import { trpc } from "@web/lib/trpc";

export function useTrashReference() {
  const utils = trpc.useUtils();
  return trpc.reference.trash.useMutation({
    onSuccess: () => utils.reference.list.invalidate(),
  });
}
