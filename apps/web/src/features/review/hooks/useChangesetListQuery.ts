import { CHANGESET_LIST_LIMIT_MAX } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

// spaceId는 Space 목록 조회가 끝나기 전엔 없을 수 있다 — 그동안은 쿼리를 미루고
// 로딩 상태로만 보여준다(빈 문자열로 잘못 스코프된 요청을 보내지 않는다).
export function useChangesetListQuery(spaceId: string | undefined) {
  return trpc.changeset.listChangesets.useQuery(
    { spaceId: spaceId ?? "", limit: CHANGESET_LIST_LIMIT_MAX },
    { enabled: spaceId !== undefined },
  );
}
