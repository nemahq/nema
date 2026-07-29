import { useCallback, useRef } from "react";

interface FieldCommitRegistry {
  registerPendingCommit: (commit: () => void) => () => void;
  flushPendingCommits: () => void;
}

// ReviewDraftProvider의 registerPendingCommit/flushPendingCommits와 같은 문제를
// 이 화면 하나의 스코프에서만 푼다 — 확정 버튼 클릭이 포커스 필드를 항상 blur시키는
// 건 아니라(일부 브라우저), 아직 로컬 버퍼에만 있고 draft로 안 넘어간 값이 확정
// 시점에 누락될 수 있다. 자동저장·undo가 없는 1회성 확정 화면이라 그 provider
// 전체(dispatch·autosave 루프)를 끌어올 이유는 없어 축소판으로 따로 둔다.
export function useFieldCommitRegistry(): FieldCommitRegistry {
  const pendingCommitsRef = useRef(new Set<() => void>());

  const registerPendingCommit = useCallback((commit: () => void) => {
    const pendingCommits = pendingCommitsRef.current;
    pendingCommits.add(commit);
    return () => {
      pendingCommits.delete(commit);
    };
  }, []);

  const flushPendingCommits = useCallback(() => {
    for (const commit of pendingCommitsRef.current) {
      commit();
    }
  }, []);

  return { registerPendingCommit, flushPendingCommits };
}
