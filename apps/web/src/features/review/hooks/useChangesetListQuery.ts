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
