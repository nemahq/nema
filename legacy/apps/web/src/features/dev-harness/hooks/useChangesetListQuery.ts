import { CHANGESET_HISTORY_LIMIT } from "@web/features/dev-harness/constants";
import { trpc } from "@web/lib/trpc";

export function useChangesetListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.changeset.listChangesets.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.changeset.listChangesets.useSuspenseQuery(
    { limit: CHANGESET_HISTORY_LIMIT },
    options,
  );
}
