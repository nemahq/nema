import { trpc } from "@web/lib/trpc";

export function useCreateSource() {
  const utils = trpc.useUtils();
  return trpc.source.create.useMutation({
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
