import { trpc } from "@web/lib/trpc";

export function usePendingRelationListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.changeset.listPendingRelations.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.changeset.listPendingRelations.useSuspenseQuery(
    undefined,
    options,
  );
}
