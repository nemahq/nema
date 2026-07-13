import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useDeleteSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.space.delete, {
    onSuccess() {
      utils.space.list.invalidate();
    },
  });
}
