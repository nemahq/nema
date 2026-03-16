import { trpc } from "@web/lib/trpc";

export function useModelPreset() {
  return trpc.dev.getModelPreset.useSuspenseQuery();
}
