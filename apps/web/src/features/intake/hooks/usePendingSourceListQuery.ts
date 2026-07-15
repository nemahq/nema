import { trpc } from "@web/lib/trpc";

// 초안 완료 신호는 Realtime 구독(useRealtimeInvalidation)이 invalidate로 밀어준다 —
// 여기선 폴링하지 않는다. refetchOnWindowFocus(기본값)가 재연결·복귀 안전망.
export function usePendingSourceListQuery() {
  return trpc.source.listPending.useQuery(undefined, {
    // LNB 초안 탭이 이 쿼리 하나로 노출 여부를 결정하는 critical 쿼리라, 실패를
    // 조용히 넘기지 않고 Sentry로 반드시 보고한다(workspace.bootstrap과 동일 패턴).
    meta: { reportToSentry: true },
  });
}
