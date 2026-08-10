import { trpc } from "@web/lib/trpc";

export function useTaskModelsQuery() {
  return trpc.dev.getTaskModels.useQuery();
}
