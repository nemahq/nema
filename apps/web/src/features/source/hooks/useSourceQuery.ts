import { trpc } from "@web/lib/trpc";

export function useSourceSuspenseQuery(
  sourceId: string,
  options?: Omit<
    Parameters<typeof trpc.source.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.get.useSuspenseQuery({ sourceId }, options);
}
