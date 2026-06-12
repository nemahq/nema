import { SOURCE_POLL_INTERVAL_MS } from "@web/features/dev-harness/constants";
import { trpc } from "@web/lib/trpc";

export function useSourceSuspenseQuery(
  input: { sourceId: string },
  options?: Omit<
    Parameters<typeof trpc.source.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.get.useSuspenseQuery(input, {
    refetchInterval: (query) =>
      query.state.data?.extractionStatus === "pending"
        ? SOURCE_POLL_INTERVAL_MS
        : false,
    ...options,
  });
}
