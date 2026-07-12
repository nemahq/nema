import { trpc } from "@web/lib/trpc";

export function useClearTaskModel() {
  const utils = trpc.useUtils();
  return trpc.dev.clearTaskModel.useMutation({
    onSuccess: () => {
      utils.dev.getTaskModels.invalidate();
    },
  });
}
