import { SOURCE_LIST_WITH_DIGESTS_LIMIT_DEFAULT } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

// 무한 스크롤 — 단위는 원문(SourceListWithDigestsCursorSchema 참고). limit은
// legacy 변경셋(CHANGESET_LIST_LIMIT_DEFAULT)보다 보수적인데, 원문 1개가
// 다이제스트 5~7행을 끌고 오기 때문이다.
export function useSourceListWithDigestsInfiniteQuery() {
  return trpc.source.listWithDigests.useSuspenseInfiniteQuery(
    { limit: SOURCE_LIST_WITH_DIGESTS_LIMIT_DEFAULT },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
}
