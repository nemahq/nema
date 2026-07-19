import { SOURCE_POLL_INTERVAL_MS } from "@web/features/dev-harness/constants";
import { trpc } from "@web/lib/trpc";

// 아직 생성 중(리뷰 미개설)인 원본이 있는 동안만 폴링한다 — 워커가 Digest를 만들어
// review가 채워지면 멈춘다.
export function usePendingSourceListQuery() {
  return trpc.source.listPending.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (item) => item.digestionOutcome === "processing",
      )
        ? SOURCE_POLL_INTERVAL_MS
        : false,
  });
}
