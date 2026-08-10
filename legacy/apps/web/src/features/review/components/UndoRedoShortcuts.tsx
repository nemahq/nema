import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";

import { useReviewUndoRedoContext } from "./ReviewDraftProvider";

// 렌더 결과가 없는 순수 단축키 등록 지점 — Digest 리뷰 화면에 떠 있는 동안만
// mod+z/mod+shift+z가 실행취소·다시 실행을 수행한다. 스택이 비어 있을 때는
// enabled=false로 걸어 아무 일도 안 일어나게 한다(다른 등록 액션과 같은 패턴).
export function UndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo } = useReviewUndoRedoContext();

  useRegisterAction("review.undo", { execute: undo, enabled: canUndo });
  useRegisterAction("review.redo", { execute: redo, enabled: canRedo });

  return null;
}
