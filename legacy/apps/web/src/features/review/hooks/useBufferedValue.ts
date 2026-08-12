import { useCallback, useEffect, useRef, useState } from "react";

// 마지막 입력 후 이만큼 멈추면 넘긴다 — 확정 차단 경고처럼 이 값에서 파생되는 표시가
// 눈에 띄게 늦지 않을 만큼 짧게, 한 단어를 치는 동안에는 안 걸릴 만큼 길게.
const COMMIT_DELAY_MS = 400;

export interface BufferedValue<T> {
  value: T;
  setValue: (next: T) => void;
  // 포커스가 필드를 벗어나는 등 경계에서 부른다 — 넘길 게 없으면 아무 일도 안 한다.
  commitNow: () => void;
  // 로컬 값이 아직 바깥(settled)과 다르다 — commitNow가 실제로 넘길 게 있는지와
  // 같은 판정을 호출부에 노출한다(포커스 재조회의 "펜딩" 판정 등에서 재사용).
  dirty: boolean;
}

interface SyncState<T> {
  // 마지막으로 확인한 바깥 값 — 이게 바뀌었을 때만 "누가 바꿨나"를 따진다.
  observedCommitted: T;
  // 넘겼지만 아직 committed로 돌아오지 않은 값. 우리 커밋이 한 박자 늦게 돌아오는
  // 동안 그걸 외부 변경으로 오해하면, 그사이 친 글자를 옛 값으로 덮어버린다.
  handedOver: { value: T } | null;
}

// 값을 로컬로 들고 있다가 경계에서만 바깥으로 넘긴다. 넘기는 시점은 둘 — 입력이
// 멈췄을 때, 그리고 호출부가 commitNow를 부를 때. 반대로 바깥이 먼저 바뀌면(우리가
// 넘긴 값이 돌아온 게 아니면) 로컬 입력을 버리고 그쪽을 따라간다.
export function useBufferedValue<T>(
  committed: T,
  commit: (next: T) => void,
  // 호출부가 매 렌더 새로 만드는 값(빈 리스트 기본값 등)을 넘기면 참조 비교로는
  // 매번 "바깥에서 바뀌었다"로 읽혀 타이핑을 되돌려버린다 — 그런 값만 따로 비교
  // 방법을 넘긴다. 모듈 상수여야 한다(렌더마다 새 함수면 아래 effect가 매번 다시 돈다).
  isEqual: (a: T, b: T) => boolean = Object.is,
): BufferedValue<T> {
  const [value, setValue] = useState(committed);
  const [sync, setSync] = useState<SyncState<T>>({
    observedCommitted: committed,
    handedOver: null,
  });

  if (!isEqual(committed, sync.observedCommitted)) {
    const isOwnEcho =
      sync.handedOver !== null && isEqual(committed, sync.handedOver.value);
    setSync({ observedCommitted: committed, handedOver: null });
    if (!isOwnEcho) {
      setValue(committed);
    }
  }

  // 바깥이 이미 알고 있는(또는 곧 알게 될) 값 — 로컬 값이 이것과 같으면 넘길 게 없다.
  // handedOver.value가 T의 정당한 값으로 falsy(null 등)일 수 있어 ??가 아니라
  // handedOver 자체의 존재 여부로 분기한다.
  const settled = sync.handedOver !== null ? sync.handedOver.value : committed;
  const latestRef = useRef({ value, settled, commit, isEqual });

  useEffect(function syncLatest() {
    latestRef.current = { value, settled, commit, isEqual };
  });

  const commitNow = useCallback(function commitPendingValue() {
    const latest = latestRef.current;
    if (latest.isEqual(latest.value, latest.settled)) {
      return;
    }
    latestRef.current = { ...latest, settled: latest.value };
    setSync((current) => ({ ...current, handedOver: { value: latest.value } }));
    latest.commit(latest.value);
  }, []);

  useEffect(
    function commitAfterPause() {
      if (isEqual(value, settled)) {
        return;
      }
      const timer = setTimeout(commitNow, COMMIT_DELAY_MS);
      return () => clearTimeout(timer);
    },
    [value, settled, commitNow, isEqual],
  );

  return { value, setValue, commitNow, dirty: !isEqual(value, settled) };
}
