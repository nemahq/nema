import { trpc } from "@web/lib/trpc";

export function useCreateSpace() {
  const utils = trpc.useUtils();

  return trpc.space.create.useMutation({
    onSuccess() {
      utils.space.list.invalidate();
    },
  });
}
