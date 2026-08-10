import { SOURCE_POLL_INTERVAL_MS } from "@web/features/dev-harness/constants";
import { trpc } from "@web/lib/trpc";

// 추출이 끝나지 않은 source가 보이는 동안만 폴링한다 (ingestion-design 2장 — 박제 응답 + 폴링)
export function useSourceListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.source.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.list.useSuspenseQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.sources.some((s) => s.extractionStatus === "pending")
        ? SOURCE_POLL_INTERVAL_MS
        : false,
    ...options,
  });
}
