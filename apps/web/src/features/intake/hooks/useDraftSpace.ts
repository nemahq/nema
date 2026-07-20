import { keepPreviousData } from "@tanstack/react-query";

import { useSpaceList } from "@web/features/workspace";

// Space 삭제로 draft가 다른 Space로 재배정되면 space.list가 무효화된다 — Suspense
// 쿼리는 그때마다 pill을 다시 매달아 깜빡이므로, 이전 목록을 보여준 채 조용히
// 갱신한다(placeholderData는 useSuspenseQuery에서 지원 안 해 일반 쿼리로 내려감).
export function useDraftSpace(spaceId: string) {
  const { data: spaceList, isError } = useSpaceList({
    placeholderData: keepPreviousData,
  });
  const space = spaceList?.spaces.find((candidate) => candidate.id === spaceId);

  return {
    spaces: spaceList?.spaces ?? null,
    spaceName: space?.name ?? null,
    // isError여도 keepPreviousData가 채워둔 이전 목록이 있으면 계속 보여준다 —
    // 배경 갱신 실패로 보여줄 게 아예 없을 때만 로딩과 구분한다.
    isLoading: !spaceList && !isError,
  };
}
