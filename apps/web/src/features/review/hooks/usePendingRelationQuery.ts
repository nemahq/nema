import { trpc } from "@web/lib/trpc";

export function usePendingRelationSuspenseQuery(
  spaceId: string,
  changesetNumber: number,
) {
  return trpc.changeset.getPendingRelationByNumber.useSuspenseQuery({
    spaceId,
    number: changesetNumber,
  });
}
