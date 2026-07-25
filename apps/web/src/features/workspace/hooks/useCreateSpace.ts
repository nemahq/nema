import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useCreateSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.space.create, {
    onSuccess() {
      utils.space.list.invalidate();
    },
  });
}
