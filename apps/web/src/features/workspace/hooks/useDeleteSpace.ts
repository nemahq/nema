import { trpc } from "@web/lib/trpc";

export function useDeleteSpace() {
  const utils = trpc.useUtils();

  return trpc.space.delete.useMutation({
    onSuccess() {
      utils.workspace.bootstrap.invalidate();
    },
  });
}
