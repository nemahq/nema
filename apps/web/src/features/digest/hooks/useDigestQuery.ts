import { trpc } from "@web/lib/trpc";

export function useDigestSuspenseQuery(
  digestId: string,
  options?: Omit<
    Parameters<typeof trpc.digest.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.digest.get.useSuspenseQuery({ digestId }, options);
}
