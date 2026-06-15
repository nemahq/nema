import { trpc } from "@web/lib/trpc";

export function useRejectPendingRelation() {
  return trpc.changeset.rejectPendingRelation.useMutation();
}
