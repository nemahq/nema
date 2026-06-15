import { trpc } from "@web/lib/trpc";

// 빼기·되돌리기·관계 해소는 진술·관계 그래프를 바꿔 검색·source 상세·이력·검토함에
// 모두 파급된다 — 관련 읽기 캐시를 한 번에 무효화한다. 배치 제출은 끝나고 1회 호출.
export function useInterventionInvalidation() {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([
      utils.source.list.invalidate(),
      utils.source.get.invalidate(),
      utils.statement.search.invalidate(),
      utils.changeset.listChangesets.invalidate(),
      utils.changeset.listPendingRelations.invalidate(),
    ]);
  };
}
