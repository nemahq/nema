import { CHANGESET_LIST_LIMIT_DEFAULT } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

// 리뷰 대기/리뷰됨 탭마다 독립적으로 페이지네이션 — 합쳐서 가져온 뒤 클라이언트에서
// 나누면 한쪽 탭만 더 불러오고 싶어도 안 쓰는 쪽까지 같이 딸려온다.
export function useChangesetListInfiniteQuery(spaceId: string, open: boolean) {
  return trpc.changeset.listChangesets.useSuspenseInfiniteQuery(
    { spaceId, open, limit: CHANGESET_LIST_LIMIT_DEFAULT },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
}

// Changeset 상세 전용 단건 조회 — listChangesets(최근 100건 캐시)를 id로 스캔하던
// 방식을 대체한다. 100건 밖의 오래된 changeset도 찾아지고, listChangesets엔 없는
// 본문 콘텐츠(changes.data 기반 스냅샷)까지 함께 온다.
export function useChangesetByNumberQuery(spaceId: string, number: number) {
  return trpc.changeset.getByNumber.useSuspenseQuery({ spaceId, number });
}
