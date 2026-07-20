import { trpc } from "@web/lib/trpc";

// Changeset 상세 전용 단건 조회 — listChangesets(최근 100건 캐시)를 number로 스캔하던
// 방식을 대체한다. 100건 밖의 오래된 changeset도 찾아지고, listChangesets엔 없는
// 본문 콘텐츠(changes.data 기반 스냅샷)까지 함께 온다.
export function useChangesetDetailSuspenseQuery(
  spaceId: string,
  changesetNumber: number,
) {
  return trpc.changeset.getByNumber.useSuspenseQuery({
    spaceId,
    number: changesetNumber,
  });
}
