import { useEffect } from "react";

import {
  type BufferedValue,
  useBufferedValue,
} from "@web/features/review/hooks/useBufferedValue";

// useDraftField와 같은 결(포커스 이탈 시 마지막 값을 흘리지 않고 flush)이지만
// ReviewDraftContext 대신 호출부가 직접 넘긴 registry에 등록한다 — 이 화면은
// context 없이 로컬 draft 하나만 편집하므로 그 결합이 필요 없다.
export function useRegisteredBufferedField<T>(
  committed: T,
  commit: (next: T) => void,
  registerPendingCommit: (commit: () => void) => () => void,
  isEqual?: (a: T, b: T) => boolean,
): BufferedValue<T> {
  const field = useBufferedValue(committed, commit, isEqual);
  const { commitNow } = field;

  useEffect(
    function joinPendingCommits() {
      const unregister = registerPendingCommit(commitNow);
      return () => {
        unregister();
        commitNow();
      };
    },
    [registerPendingCommit, commitNow],
  );

  return field;
}
