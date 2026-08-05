import { useIsMutating } from "@tanstack/react-query";
import { getMutationKey } from "@trpc/react-query";

import { queryClient } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

const CREATE_SOURCE_MUTATION_KEY = getMutationKey(trpc.source.create);

// trpc는 모듈 스코프에서 안정적인 참조라 렌더 밖에서 한 번만 계산해도 된다
// (useRealtimeInvalidation.ts와 같은 패턴).
function matchesSpace(spaceId: string | undefined) {
  return (mutation: { state: { variables: unknown } }) => {
    if (spaceId === undefined) {
      return false;
    }
    const variables = mutation.state.variables;
    return (
      typeof variables === "object" &&
      variables !== null &&
      "spaceId" in variables &&
      variables.spaceId === spaceId
    );
  };
}

// source.create 뮤테이션은 컴포저가 서브탭 전환·화면 이동으로 재마운트되는
// 동안에도 계속 진행 중일 수 있다. 로컬 useMutation().isPending은 그 인스턴스가
// 요청을 직접 시작했을 때만 true가 되므로 대신 어느 컴포저 인스턴스가 시작했는지와
// 무관하게 전역 뮤테이션 캐시에서 이 Space로의 제출이 진행 중인지 직접 구독한다.
export function useIsCreatingSource(spaceId: string | undefined): boolean {
  const pendingCount = useIsMutating({
    mutationKey: CREATE_SOURCE_MUTATION_KEY,
    predicate: matchesSpace(spaceId),
  });
  return pendingCount > 0;
}

// beforeunload·unmount flush처럼 React 렌더 사이클 밖(원시 DOM 이벤트)에서 불리는
// 경로용. useIsCreatingSource(위)는 mutate() 호출 시점의 캐시 변화가 리렌더·effect를
// 거쳐야 반영되므로, 그 커밋이 아직 안 끝난 찰나에 flush가 끼어들면 한 박자 뒤처진
// 값을 본다 — mutate()가 이미 저장소를 지운 뒤인데도 그 사실을 못 보고 화면에
// 남은 값을 다시 써버릴 수 있다. 뮤테이션 캐시를 직접 동기 조회해 그 지연을 없앤다.
export function isCreatingSourceNow(spaceId: string | undefined): boolean {
  return (
    queryClient.getMutationCache().findAll({
      mutationKey: CREATE_SOURCE_MUTATION_KEY,
      status: "pending",
      predicate: matchesSpace(spaceId),
    }).length > 0
  );
}
