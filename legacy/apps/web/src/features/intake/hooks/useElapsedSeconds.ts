import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 1_000;

function secondsSince(since: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 1000),
  );
}

// since는 상세 패널이 sourceId로 remount될 때만 바뀐다(DraftsScreen의
// key={selectedDraft.sourceId})고 가정 — 그래서 마운트 시 지연 초기화 한 번이면
// 충분하고, 매 tick마다 setInterval 콜백에서만 다시 계산하면 된다.
export function useElapsedSeconds(since: string): number {
  const [elapsed, setElapsed] = useState(() => secondsSince(since));

  useEffect(
    function tickElapsed() {
      const interval = setInterval(
        () => setElapsed(secondsSince(since)),
        TICK_INTERVAL_MS,
      );
      return () => clearInterval(interval);
    },
    [since],
  );

  return elapsed;
}
