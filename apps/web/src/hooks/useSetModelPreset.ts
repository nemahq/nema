import { trpc } from "@web/lib/trpc";

export function useSetModelPreset() {
  const utils = trpc.useUtils();

  return trpc.dev.setModelPreset.useMutation({
    onSuccess: (data) => {
      utils.dev.getModelPreset.setData(undefined, data);
    },
  });
}
