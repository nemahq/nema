import { trpc } from "@web/lib/trpc";

export function useRenameSpace() {
  const utils = trpc.useUtils();

  return trpc.space.rename.useMutation({
    onSuccess() {
      utils.workspace.bootstrap.invalidate();
    },
  });
}
