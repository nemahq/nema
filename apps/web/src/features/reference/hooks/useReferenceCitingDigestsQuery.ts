import { trpc } from "@web/lib/trpc";

export function useReferenceCitingDigestsSuspenseQuery(referenceId: string) {
  return trpc.reference.citingDigests.useSuspenseQuery({ referenceId });
}
