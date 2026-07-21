import { trpc } from "@web/lib/trpc";

export function useReferenceListSuspenseQuery(
  input: Parameters<typeof trpc.reference.list.useSuspenseQuery>[0],
  options?: Omit<
    Parameters<typeof trpc.reference.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.reference.list.useSuspenseQuery(input, options);
}

export function useReferenceListInfiniteQuery(
  input: Omit<
    Parameters<typeof trpc.reference.list.useSuspenseInfiniteQuery>[0],
    "cursor"
  >,
  options?: Omit<
    Parameters<typeof trpc.reference.list.useSuspenseInfiniteQuery>[1],
    "queryKey" | "getNextPageParam"
  >,
) {
  return trpc.reference.list.useSuspenseInfiniteQuery(input, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...options,
  });
}
