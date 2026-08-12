import * as Sentry from "@sentry/react";
import { TRPCClientError } from "@trpc/client";

import { trpc } from "@web/lib/trpc";

export function useUpdateReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    // 이제 이 mutation은 자동 저장이 상시(디바운스마다) 돌린다 — 실패마다 전역
    // Infinity-duration 토스트가 쌓이면 소음이 된다. 실패는 ReviewDraftProvider가
    // 저장 상태 표시(navbar)로 대신 눈에 띄게 한다.
    meta: { skipGlobalToast: true },
    // meta.reportToSentry 없이 skipGlobalToast만 켜면 TRPCClientError(네트워크
    // 실패 포함)가 전역 큐(mutationCache.onError)에서도 자동으로는 Sentry에
    // 안 잡힌다 — 자동 저장이 조용히 실패해도 아무도 못 알아채는 상태가 된다.
    // CONFLICT(버전 충돌)는 두 탭 동시 편집 같은 예상된 거부라 제외하고(서버가
    // EXPECTED_DOMAIN_CODES로 이미 걸러내는 것과 같은 기준), 그 외 실패는
    // useDeleteAccount.ts와 같은 패턴으로 직접 캡처한다.
    onError: (error) => {
      if (
        !(error instanceof TRPCClientError) ||
        error.data?.code !== "CONFLICT"
      ) {
        Sentry.captureException(error);
      }
    },
    onSuccess: (data) => {
      // invalidate()는 재조회를 백그라운드로 걸 뿐 기다리지 않는다 — 그 사이 곧장
      // 재시도(예: 저장은 성공했지만 확정이 실패해 다시 확정)하면 화면이 아직 옛
      // draftVersion을 들고 있어 방금 자신이 성공시킨 저장을 NM012(버전 충돌)로
      // 오인 거절한다. 응답이 이미 쥔 값을 캐시에 동기적으로 반영해 그 창을 없앤다.
      utils.digestReview.get.setData(
        { spaceId, number: changesetNumber },
        (current) =>
          current ? { ...current, draftVersion: data.draftVersion } : current,
      );
      // refetchType: "none" — 이 mutation은 이제 자동 저장으로 계속 돈다. 기본
      // refetchType("active")로 두면 성공마다 백그라운드 재조회가 걸리고, 그 응답이
      // 늦게 도착하면(느린 네트워크 등) 그 사이 사용자가 이어 친 편집을 조용히
      // 덮어쓴다 — 이 화면이 막으려는 바로 그 사고다. topic/tag는 애초에 id를 안
      // 보내고 이름만 보내(서버가 이름으로 find-or-create) 재조회로 갱신된 id를
      // 받아와야 할 이유가 없고, 새 레퍼런스는 클라이언트가 만든 id를 계속 그대로
      // 쓰므로(서버는 그 id로 upsert만 한다) 마찬가지로 재조회가 급하지 않다 —
      // 캐시만 stale로 표시해두면 충분하다.
      utils.digestReview.get.invalidate(
        { spaceId, number: changesetNumber },
        { refetchType: "none" },
      );
      utils.source.listPending.invalidate();
    },
  });
}
