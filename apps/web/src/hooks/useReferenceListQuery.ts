import { trpc } from "@web/lib/trpc";

export function useReferenceListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.reference.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.reference.list.useSuspenseQuery(undefined, options);
}
