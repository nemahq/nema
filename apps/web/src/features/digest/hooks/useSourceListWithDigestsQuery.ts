import { trpc } from "@web/lib/trpc";

export function useSourceListWithDigestsSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.source.listWithDigests.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.listWithDigests.useSuspenseQuery(undefined, options);
}
