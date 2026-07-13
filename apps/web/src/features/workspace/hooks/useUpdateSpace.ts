import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.space.update, {
    onSuccess() {
      utils.space.list.invalidate();
    },
  });
}
