import { trpc } from "@web/lib/trpc";

export function useCancelSource() {
  const utils = trpc.useUtils();

  return trpc.source.cancelDigestion.useMutation({
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
