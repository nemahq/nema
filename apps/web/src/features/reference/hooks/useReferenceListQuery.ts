import { trpc } from "@web/lib/trpc";

export function useReferenceListSuspenseQuery() {
  return trpc.reference.list.useSuspenseQuery(undefined);
}
