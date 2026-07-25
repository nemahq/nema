import { trpc } from "@web/lib/trpc";

export function useReferenceDetailSuspenseQuery(referenceId: string) {
  return trpc.reference.get.useSuspenseQuery({ referenceId });
}
