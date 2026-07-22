import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@web/hooks/useDebouncedValue";
import {
  deleteRecordEntry,
  getRecordEntry,
  setRecordEntry,
} from "@web/utils/localStorage";

// 최대 10만 자(SOURCE_BODY_MAX_LENGTH)까지 다뤄 키 입력마다 즉시 저장하면
// 매번 전체 텍스트를 재직렬화하게 된다 — 그래서 디바운스로 묶는다.
const SAVE_DELAY_MS = 500;

function persist(spaceId: string, body: string): void {
  if (body !== "") {
    setRecordEntry("sourceComposerBody", spaceId, body);
  } else {
    deleteRecordEntry("sourceComposerBody", spaceId);
  }
}

export function useSourceComposerBody(
  spaceId: string | undefined,
): [string, (v: string) => void] {
  const [body, setBodyState] = useState(() =>
    spaceId ? (getRecordEntry("sourceComposerBody", spaceId) ?? "") : "",
  );
  const debouncedBody = useDebouncedValue(body, SAVE_DELAY_MS);
  const bodyRef = useRef(body);

  useEffect(function syncLatestBody() {
    bodyRef.current = body;
  });

  useEffect(
    function persistDebouncedBody() {
      if (spaceId) {
        persist(spaceId, debouncedBody);
      }
    },
    [spaceId, debouncedBody],
  );

  // 언마운트·beforeunload 시 즉시 flush — 디바운스 대기 중 유실 방지
  useEffect(
    function flushOnUnmount() {
      if (!spaceId) {
        return;
      }
      const flush = () => persist(spaceId, bodyRef.current);
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
    // 클리어(제출 성공)는 디바운스를 건너뛰고 즉시 반영한다.
    if (next === "" && spaceId) {
      deleteRecordEntry("sourceComposerBody", spaceId);
    }
  }

  return [body, setBody];
}
