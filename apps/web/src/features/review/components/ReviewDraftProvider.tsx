import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useReviewDraftDispatch } from "@web/features/review/hooks/useDigestReviewQuery";
import type { ReviewDraftAction } from "@web/features/review/reviewDraft";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";

interface ReviewDraftContextValue {
  dispatch: (action: ReviewDraftAction) => void;
  // 손댄 적이 있으면 확정 시 저장을 한 번 태운다. 되돌려 친 편집까지 되돌아왔다고
  // 보지는 않는다 — 초안이 서버 원본과 같아졌는지는 값 비교로만 알 수 있고, 그
  // 비교를 하려고 원본 사본을 따로 들면 이번 구조가 없앤 이중 상태가 되살아난다.
  dirty: boolean;
  // 타이핑 중인 필드가 "아직 초안에 안 넘긴 값이 있다"고 알려두는 자리 — 초안을
  // 바꾸는 다른 조작이 끼어들기 직전에 여기 모인 값들을 먼저 넘긴다.
  registerPendingCommit: (commit: () => void) => () => void;
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null);

interface ReviewDraftProviderProps {
  children: ReactNode;
}

export function ReviewDraftProvider({ children }: ReviewDraftProviderProps) {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const dispatchToDraft = useReviewDraftDispatch(spaceId, changesetNumber);
  const [dirty, setDirty] = useState(false);
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
      setDirty(true);
      dispatchToDraft(action);
    },
    [flushPendingCommits, dispatchToDraft],
  );

  useEffect(
    function flushPendingCommitsOnUnload() {
      window.addEventListener("beforeunload", flushPendingCommits);
      return () => {
        window.removeEventListener("beforeunload", flushPendingCommits);
      };
    },
    [flushPendingCommits],
  );

  const draftContext = useMemo(
    () => ({ dispatch, dirty, registerPendingCommit }),
    [dispatch, dirty, registerPendingCommit],
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
