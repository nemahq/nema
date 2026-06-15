import { trpc } from "@web/lib/trpc";

export function useApplyPendingRelation() {
  return trpc.changeset.applyPendingRelation.useMutation();
}
