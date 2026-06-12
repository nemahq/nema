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
    // 추출이 끝나는 순간 진술이 임베딩 pending으로 생기므로, 임베딩까지 끝나야 폴링을 멈춘다
    refetchInterval: (query) => {
      const source = query.state.data;
      const processing =
        source?.extractionStatus === "pending" ||
        source?.statements.some((s) => s.ingestionStatus === "pending");
      return processing ? SOURCE_POLL_INTERVAL_MS : false;
    },
    ...options,
  });
}
