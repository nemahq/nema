import { trpc } from "@web/lib/trpc";

// 삭제 확인을 무장했을 때만(enabled) 인용 여부를 묻는다 — 목록 렌더 때마다 전부
// 조회하면 레퍼런스 수만큼 쿼리가 뜬다.
export function useReferenceCitingDigestsQuery(
  referenceId: string,
  options: { enabled: boolean },
) {
  return trpc.reference.citingDigests.useQuery(
    { referenceId },
    { enabled: options.enabled },
  );
}
