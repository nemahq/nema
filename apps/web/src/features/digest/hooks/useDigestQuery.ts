import { trpc } from "@web/lib/trpc";

// 상세 헤더(삭제 버튼)가 쓰는 non-suspense 변형 — digest.get 응답이 아직 없어도
// 헤더 자체는 렌더돼야 한다(DigestDetailPanel 참고). 같은 입력이면 아래
// useDigestSuspenseQuery와 캐시를 공유해 요청이 중복되지 않는다.
export function useDigestQuery(digestPublicId: string) {
  return trpc.digest.get.useQuery({ digestPublicId });
}

export function useDigestSuspenseQuery(
  digestPublicId: string,
  options?: Omit<
    Parameters<typeof trpc.digest.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.digest.get.useSuspenseQuery({ digestPublicId }, options);
}
