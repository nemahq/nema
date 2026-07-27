import { trpc } from "@web/lib/trpc";

export function useUpdateReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
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
      utils.digestReview.get.invalidate({ spaceId, number: changesetNumber });
      utils.source.listPending.invalidate();
    },
  });
}
