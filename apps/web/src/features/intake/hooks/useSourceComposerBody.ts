import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@web/hooks/useDebouncedValue";
import {
  deleteRecordEntry,
  getRecordEntry,
  setRecordEntry,
} from "@web/utils/localStorage";

import {
  isCreatingSourceNow,
  useIsCreatingSource,
} from "./useIsCreatingSource";

// 최대 10만 자(SOURCE_BODY_MAX_LENGTH)까지 다뤄 키 입력마다 즉시 저장하면
// 매번 전체 텍스트를 재직렬화하게 된다 — 그래서 디바운스로 묶는다.
const SAVE_DELAY_MS = 500;

// resyncAfterSubmit용 — setState를 effect 본문에서 동기 호출하면 react-compiler
// 린트(cascading render 경고)에 걸려(usePendingAfterDelay.ts와 같은 이유)
// setTimeout 콜백 안에서 부른다.
const RESYNC_DELAY_MS = 0;

// useCreateSource의 뮤테이션 옵션 콜백(onMutate/onError/onSuccess)과 같은 키를
// 공유하는 저장소 접근 — 두 파일이 "제출 시 지우고 실패 시 되돌린다"는 같은
// 계약을 어긋남 없이 따르도록 여기 한 곳에 모은다.
function readComposerBody(spaceId: string): string {
  return getRecordEntry("sourceComposerBody", spaceId) ?? "";
}

export function persistComposerBody(spaceId: string, body: string): void {
  if (body !== "") {
    setRecordEntry("sourceComposerBody", spaceId, body);
  } else {
    deleteRecordEntry("sourceComposerBody", spaceId);
  }
}

export function clearComposerBody(spaceId: string): void {
  deleteRecordEntry("sourceComposerBody", spaceId);
}

interface UseSourceComposerBodyResult {
  body: string;
  setBody: (v: string) => void;
  // "요청 진행 중" ∩ "컴포저가 화면에 있음" — 전역 뮤테이션 캐시 기준이라 서브탭
  // 이동 뒤 재마운트돼도 아직 진행 중이면 다시 true가 된다.
  isSubmitting: boolean;
}

export function useSourceComposerBody(
  spaceId: string | undefined,
): UseSourceComposerBodyResult {
  const [body, setBodyState] = useState(() =>
    spaceId ? readComposerBody(spaceId) : "",
  );
  const debouncedBody = useDebouncedValue(body, SAVE_DELAY_MS);
  const bodyRef = useRef(body);
  const isSubmitting = useIsCreatingSource(spaceId);
  const wasSubmittingRef = useRef(isSubmitting);

  useEffect(function syncLatestBody() {
    bodyRef.current = body;
  });

  useEffect(
    function persistDebouncedBody() {
      // 제출 중엔 useCreateSource의 onMutate가 이미 지운 저장소를 화면에 남아있는
      // (아직 안 비워진) body로 다시 덮어쓰지 않는다. 제출이 막 끝난 렌더 한 번도
      // 건너뛴다 — debouncedBody가 아직 제출 전 값에 머물러 있어(디바운스가 못
      // 따라옴), 그 값을 그대로 쓰면 곧이어 resyncAfterSubmit이 되돌려 놓을 저장소를
      // 이 렌더에서 먼저 덮어써 버린다. 이 판단은 resyncAfterSubmit이 wasSubmittingRef를
      // 갱신하기 전, 같은 커밋 안에서 선언 순서상 먼저 실행되기 때문에 유효하다.
      const justEndedSubmit = wasSubmittingRef.current && !isSubmitting;
      if (spaceId && !isSubmitting && !justEndedSubmit) {
        persistComposerBody(spaceId, debouncedBody);
      }
    },
    [spaceId, debouncedBody, isSubmitting],
  );

  // 제출이 끝나면(성공·실패 무관) 저장소 기준으로 다시 맞춘다. 성공이면
  // useCreateSource의 onSuccess가 이미 지웠으니 빈 문자열로, 실패면 onError가
  // 원문을 되돌려놨으니 그대로 복원된다 — 어느 컴포저 인스턴스가 제출을
  // 시작했는지와 무관하게 항상 저장소와 같은 값으로 수렴한다.
  useEffect(
    function resyncAfterSubmit() {
      const justEndedSubmit = wasSubmittingRef.current && !isSubmitting;
      wasSubmittingRef.current = isSubmitting;
      if (!(justEndedSubmit && spaceId)) {
        return;
      }
      const nextBody = readComposerBody(spaceId);
      const timer = setTimeout(() => setBodyState(nextBody), RESYNC_DELAY_MS);
      return () => clearTimeout(timer);
    },
    [isSubmitting, spaceId],
  );

  // 언마운트·beforeunload 시 즉시 flush — 디바운스 대기 중 유실 방지.
  // 제출이 진행 중이면 건너뛴다: onMutate가 이미 저장소를 지웠는데 화면엔 아직
  // 그 원문이 남아있어(처리 중 표시를 위해 유지), 그대로 flush하면 이미 서버로
  // 보낸 원문이 새로고침 후 되살아난다. isSubmitting(리렌더로 갱신)이 아니라
  // isCreatingSourceNow로 뮤테이션 캐시를 그 자리에서 동기 조회하는 이유는
  // useIsCreatingSource.ts 참고 — flush는 원시 DOM 이벤트라 리렌더를 기다릴 수 없다.
  useEffect(
    function flushOnUnmount() {
      if (!spaceId) {
        return;
      }
      const flush = () => {
        if (!isCreatingSourceNow(spaceId)) {
          persistComposerBody(spaceId, bodyRef.current);
        }
      };
      window.addEventListener("beforeunload", flush);
      return () => {
        window.removeEventListener("beforeunload", flush);
        flush();
      };
    },
    [spaceId],
  );

  function setBody(next: string) {
    setBodyState(next);
    // 클리어는 디바운스를 건너뛰고 즉시 반영한다.
    if (next === "" && spaceId) {
      deleteRecordEntry("sourceComposerBody", spaceId);
    }
  }

  return { body, setBody, isSubmitting };
}
