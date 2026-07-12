import { DRAFT_POLL_INTERVAL_MS } from "@web/features/intake/constants";
import { trpc } from "@web/lib/trpc";

// digestion이 진행 중인 초안이 있는 동안만 폴링 — 전부 처리 상태를 벗어나면 멈춘다.
export function usePendingSourceListQuery() {
  return trpc.source.listPending.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (source) => source.digestionStatus === "pending",
      )
        ? DRAFT_POLL_INTERVAL_MS
        : false,
  });
}
