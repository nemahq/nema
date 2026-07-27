import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useReviewDraftDispatch } from "@web/features/review/hooks/useDigestReviewQuery";
import type { ReviewDraftAction } from "@web/features/review/reviewDraft";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";

interface ReviewDraftContextValue {
  dispatch: (action: ReviewDraftAction) => void;
  // 타이핑 중인 필드가 "아직 초안에 안 넘긴 값이 있다"고 알려두는 자리 — 초안을
  // 바꾸는 다른 조작이 끼어들기 직전에 여기 모인 값들을 먼저 넘긴다.
  registerPendingCommit: (commit: () => void) => () => void;
  // dispatch를 거치지 않고 밀린 커밋만 넘긴다 — 확정처럼 "지금 이 순간 초안이
  // 뭔 모습인가"를 다시 읽어야 하는 지점에서, 포커스 이탈 없이도(예: 버튼 클릭이
  // blur를 안 일으키는 브라우저) 최신 값을 캐시에 반영해두기 위해 쓴다.
  flushPendingCommits: () => void;
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null);

interface ReviewDraftProviderProps {
  children: ReactNode;
}

export function ReviewDraftProvider({ children }: ReviewDraftProviderProps) {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const dispatchToDraft = useReviewDraftDispatch(spaceId, changesetNumber);
  const pendingCommitsRef = useRef(new Set<() => void>());
  const flushingRef = useRef(false);

  const registerPendingCommit = useCallback((commit: () => void) => {
    const pendingCommits = pendingCommitsRef.current;
    pendingCommits.add(commit);
    return () => {
      pendingCommits.delete(commit);
    };
  }, []);

  // 각 commit이 다시 dispatch를 부르고 dispatch가 또 여길 부른다 — 재진입을 막지
  // 않으면 필드 하나를 넘길 때마다 전체 플러시가 처음부터 다시 돈다.
  const flushPendingCommits = useCallback(() => {
    if (flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    try {
      for (const commit of [...pendingCommitsRef.current]) {
        commit();
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  // 초안을 바꾸는 모든 경로가 여기 하나로 모이므로, 밀린 타이핑을 넘기는 것도
  // 호출부마다 챙기지 않고 여기서 한 번에 한다 — 타입 변경처럼 body를 통째로
  // 갈아끼우는 조작 뒤에 옛 값이 뒤늦게 도착하는 순서 사고를 구조적으로 막는다.
  const dispatch = useCallback(
    (action: ReviewDraftAction) => {
      flushPendingCommits();
      dispatchToDraft(action);
    },
    [flushPendingCommits, dispatchToDraft],
  );

  const draftContext = useMemo(
    () => ({ dispatch, registerPendingCommit, flushPendingCommits }),
    [dispatch, registerPendingCommit, flushPendingCommits],
  );

  return (
    <ReviewDraftContext value={draftContext}>{children}</ReviewDraftContext>
  );
}

export function useReviewDraftContext(): ReviewDraftContextValue {
  const context = useContext(ReviewDraftContext);
  if (!context) {
    throw new Error(
      "useReviewDraftContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}
