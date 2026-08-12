import { useEffect, useRef } from "react";

import { useReviewDraftContext } from "@web/features/review/components/ReviewDraftProvider";
import {
  type BufferedValue,
  useBufferedValue,
} from "@web/features/review/hooks/useBufferedValue";

// 필드의 로컬 버퍼를 초안 편집에 붙인다 — 글자마다 초안을 갈아엎으면 그 초안을
// 구독하는 화면 전체가 매 입력마다 다시 그려진다. 입력 멈춤·경계 호출에 더해, 초안을
// 바꾸는 다른 조작이 끼어들기 직전에도 Provider가 대신 넘겨준다.
export function useDraftField<T>(
  committed: T,
  commit: (next: T) => void,
  isEqual?: (a: T, b: T) => boolean,
): BufferedValue<T> {
  const { registerPendingCommit, reportFieldDirty } = useReviewDraftContext();
  const field = useBufferedValue(committed, commit, isEqual);
  const { commitNow, dirty } = field;
  // registerPendingCommit은 마운트 내내 등록돼 있어(flush 대상 자체는 항상 존재) 이
  // dirty 여부와는 별개다 — 포커스 재조회가 "지금 실제로 안 넘어간 값이 있는지"를
  // 물을 땐 이 토큰으로 집계된 dirty 필드 수를 쓴다.
  const tokenRef = useRef({});

  useEffect(
    function joinPendingCommits() {
      const unregister = registerPendingCommit(commitNow);
      // 화면을 벗어날 때도 마지막 입력을 흘리지 않는다 — 초안은 쿼리 캐시에 남아
      // 다시 들어오면 이어서 편집하게 된다.
      return () => {
        unregister();
        commitNow();
      };
    },
    [registerPendingCommit, commitNow],
  );

  useEffect(
    function reportDirtyState() {
      const token = tokenRef.current;
      reportFieldDirty(token, dirty);
      return () => reportFieldDirty(token, false);
    },
    [reportFieldDirty, dirty],
  );

  return field;
}
