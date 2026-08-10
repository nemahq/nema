import { trpc } from "@web/lib/trpc";

export function useModelPresetQuery() {
  return trpc.dev.getModelPreset.useQuery();
}
