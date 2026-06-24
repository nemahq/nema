import { trpc } from "@web/lib/trpc";

export function useDraftListQuery() {
  return trpc.draft.list.useQuery();
}
