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
    // LNB 초안 탭이 이 쿼리 하나로 노출 여부를 결정하는 critical 쿼리라, 실패를
    // 조용히 넘기지 않고 Sentry로 반드시 보고한다(workspace.bootstrap과 동일 패턴).
    meta: { reportToSentry: true },
  });
}
