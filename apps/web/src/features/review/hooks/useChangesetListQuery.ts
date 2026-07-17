import {
  CHANGESET_LIST_LIMIT_DEFAULT,
  CHANGESET_LIST_LIMIT_MAX,
} from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

// spaceId는 이미 해석된 값만 받는다(space.list suspense 이후에만 호출) — 연쇄
// suspense query는 enabled 분기를 못 써서, 호출 순서 자체로 의존을 표현한다.
export function useChangesetListSuspenseQuery(spaceId: string) {
  return trpc.changeset.listChangesets.useSuspenseQuery(
    { spaceId, limit: CHANGESET_LIST_LIMIT_MAX },
    // 변경사항 탭 배지를 떠받치는 쿼리 — 실패를 조용히 넘기지 않고 보고한다
    // (형제 쿼리 space.list와 동일 패턴).
    { meta: { reportToSentry: true } },
  );
}

// 리뷰 대기/리뷰됨 탭마다 독립적으로 페이지네이션 — 합쳐서 가져온 뒤 클라이언트에서
// 나누면 한쪽 탭만 더 불러오고 싶어도 안 쓰는 쪽까지 같이 딸려온다.
export function useChangesetListInfiniteQuery(spaceId: string, open: boolean) {
  return trpc.changeset.listChangesets.useSuspenseInfiniteQuery(
    { spaceId, open, limit: CHANGESET_LIST_LIMIT_DEFAULT },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
}
