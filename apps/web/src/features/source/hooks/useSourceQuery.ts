import { trpc } from "@web/lib/trpc";

// 상세 헤더(삭제 버튼)가 쓰는 non-suspense 변형 — source.get 응답이 아직 없어도
// 헤더 자체는 렌더돼야 한다(SourceDetailPanel 참고). 같은 입력이면 아래
// useSourceSuspenseQuery와 캐시를 공유해 요청이 중복되지 않는다.
export function useSourceQuery(sourcePublicId: string) {
  return trpc.source.get.useQuery({ sourcePublicId });
}

export function useSourceSuspenseQuery(
  sourcePublicId: string,
  options?: Omit<
    Parameters<typeof trpc.source.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.get.useSuspenseQuery({ sourcePublicId }, options);
}
