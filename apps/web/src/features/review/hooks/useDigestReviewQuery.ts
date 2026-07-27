import { useCallback } from "react";

import {
  type ReviewDraftAction,
  reviewDraftReducer,
} from "@web/features/review/reviewDraft";
import { trpc } from "@web/lib/trpc";

// 이 응답은 읽기만 하는 서버 상태가 아니라 편집 중인 초안 그 자체다 — 자동 재조회가
// 걸리면 사람이 고치던 내용을 서버 원본이 조용히 덮어쓴다. 그래서 이 쿼리만 자동
// 무효화 축(staleTime 만료·창 포커스·재접속·재마운트)에서 전부 빼고, 재조회는 저장
// 성공 후 명시적 invalidate(useUpdateReview)로만 일어나게 한다.
const REVIEW_DRAFT_QUERY_OPTIONS = {
  staleTime: Infinity,
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
