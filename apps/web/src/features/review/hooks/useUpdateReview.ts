import { trpc } from "@web/lib/trpc";

export function useUpdateReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    // 이제 이 mutation은 자동 저장이 상시(디바운스마다) 돌린다 — 실패마다 전역
    // Infinity-duration 토스트가 쌓이면 소음이 된다. 실패는 ReviewDraftProvider가
    // 저장 상태 표시(navbar)로 대신 눈에 띄게 한다.
    meta: { skipGlobalToast: true },
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
      // 덮어쓴다 — 이 화면이 막으려는 바로 그 사고다. topics/tags/새 레퍼런스의
      // 서버 쪽 id는 저장 때마다 이름으로 다시 find-or-create되어 무시되므로(스키마
      // 주석 참고), 굳이 재조회로 앞당겨 받아올 필요가 없다 — 캐시만 stale로
      // 표시해두면 충분하다.
      utils.digestReview.get.invalidate(
        { spaceId, number: changesetNumber },
        { refetchType: "none" },
      );
      utils.source.listPending.invalidate();
    },
  });
}
