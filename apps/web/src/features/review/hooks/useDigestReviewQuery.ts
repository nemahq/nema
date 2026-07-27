import { useCallback } from "react";

import {
  type ReviewDraft,
  type ReviewDraftAction,
  reviewDraftReducer,
} from "@web/features/review/reviewDraft";
import { trpc } from "@web/lib/trpc";

// 이 응답은 읽기만 하는 서버 상태가 아니라 편집 중인 초안 그 자체다 — 자동 재조회가
// 걸리면 사람이 고치던 내용을 서버 원본이 조용히 덮어쓴다. staleTime·focus·reconnect·
// mount는 재조회를, gcTime은 관찰자가 없는 동안(화면을 나간 사이) 캐시에서 아예
// 쫓겨나는 걸 막는다 — gcTime을 안 늘리면 기본 5분 뒤엔 재조회 축을 다 꺼놔도
// 캐시가 비어 있어 재진입 시 서버 원본으로 다시 채워지며 편집분이 소멸한다.
// 재조회는 저장 성공 후 명시적 invalidate(useUpdateReview)로만 일어나게 한다.
const REVIEW_DRAFT_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

export function useDigestReviewSuspenseQuery(
  spaceId: string,
  changesetNumber: number,
) {
  return trpc.digestReview.get.useSuspenseQuery(
    { spaceId, number: changesetNumber },
    REVIEW_DRAFT_QUERY_OPTIONS,
  );
}

// 편집은 이 캐시를 직접 갱신한다 — 초안을 별도 스토어로 복사해 두면 "지금 초안이 뭔
// 모습인가"를 두 군데서 봐야 하고, 재조회는 그중 한쪽만 갱신한다.
export function useReviewDraftDispatch(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();

  return useCallback(
    (action: ReviewDraftAction) => {
      utils.digestReview.get.setData(
        { spaceId, number: changesetNumber },
        (current) => (current ? reviewDraftReducer(current, action) : current),
      );
    },
    [utils, spaceId, changesetNumber],
  );
}

// 렌더 클로저가 쥔 draft는 그 렌더 시점의 스냅샷이다 — 확정처럼 "지금 이 순간
// 캐시에 실제로 뭐가 들었는가"를 다시 확인해야 하는 지점(예: 필드 로컬 버퍼를
// 방금 플러시한 직후)에선 이 함수로 캐시를 직접 다시 읽어야, 그 플러시가 아직
// 리렌더로 반영되기 전이라도 최신 값을 얻는다.
export function useReviewDraftReader(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();

  return useCallback(
    (): ReviewDraft | undefined =>
      utils.digestReview.get.getData({ spaceId, number: changesetNumber }),
    [utils, spaceId, changesetNumber],
  );
}

// 실행취소/다시 실행처럼 액션을 거치지 않고 캐시를 스냅샷으로 통째로 되돌리는
// 경로 전용 — reviewDraftReducer를 거치는 일반 편집은 useReviewDraftDispatch를 쓴다.
export function useReviewDraftWriter(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();

  return useCallback(
    (next: ReviewDraft) => {
      utils.digestReview.get.setData(
        { spaceId, number: changesetNumber },
        next,
      );
    },
    [utils, spaceId, changesetNumber],
  );
}
