import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import {
  useReviewDraftDispatch,
  useReviewDraftReader,
  useReviewDraftWriter,
} from "@web/features/review/hooks/useDigestReviewQuery";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import type {
  ReviewDraft,
  ReviewDraftAction,
} from "@web/features/review/reviewDraft";
import { buildUpdateReviewPayload } from "@web/features/review/reviewSavePayload";
import {
  classifyReviewSaveError,
  type ReviewSaveStatus,
} from "@web/features/review/reviewSaveStatus";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";

// 자동 저장 디바운스 — 필드 버퍼(useBufferedValue의 COMMIT_DELAY_MS=400ms, 타이핑
// 멈춤→초안 반영)와는 별개 축이다. 초안이 바뀔 때마다(필드 커밋 하나하나 포함) 그
// 위에 한 번 더 디바운스를 얹어 "초안 반영→서버 저장"을 한 번의 요청으로 묶는다.
// 필드 커밋들이 서로 조금씩 시차를 두고 도착해도 그때마다 이 타이머가 다시 걸리며
// 한 번의 요청으로 뭉치도록, 필드 쪽 디바운스보다 충분히 길게 둔다.
const AUTOSAVE_DEBOUNCE_MS = 1000;

// 편집 하나(필드 커밋 하나)마다 실행취소 스냅샷이 하나 쌓이고 gcTime: Infinity라
// 세션 내내 회수되지 않는다 — 상한 없이 두면 긴 편집 세션에서 무한히 자란다. 되돌릴
// 일이 실제로 거의 없는 오래된 스냅샷부터 버린다.
const MAX_UNDO_STACK_SIZE = 50;

interface ReviewAutosaveEntry {
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  savingPromise: Promise<void> | null;
  // 리마운트를 오가며 공유되는 값이라 saveStatus를 컴포넌트 useState로 두면 안 된다 —
  // 저장이 실패한 채로 화면을 나갔다 돌아오면 새 인스턴스는 이 상태를 모른 채 "방금
  // 저장됨"으로 초기화돼, 실제로는 안 끝난 확정 차단 가드가 조용히 풀린다. 이 값도
  // entry에 실어 리마운트에도 살아남게 한다.
  status: ReviewSaveStatus;
  statusListeners: Set<() => void>;
}

// changesetNumber로 라우트 shell 전체가 key를 걸어(router.tsx) 다른 changeset을
// 거쳐 돌아오면 이 Provider도 새 인스턴스로 리마운트된다 — dirty·타이머·진행 중인
// 저장 promise를 컴포넌트 ref로만 들면, 언마운트 시점에 흘려보낸(fire-and-forget)
// flushPendingSave가 아직 응답을 못 받은 채로 새 인스턴스가 뜨는 순간 그 인스턴스는
// "아무것도 안 밀렸다"고 오판해 확정이 그 저장을 기다리지 않고 먼저 나갈 수 있다
// (편집 → 이탈 → 다른 changeset → 복귀 → 즉시 확정 경로에서 조용한 데이터 유실).
// 세션(탭) 동안 changeset별로 하나씩만 존재하면 되므로 모듈 레벨 Map으로 빼서, 같은
// key로 다시 마운트된 인스턴스도 이전 인스턴스가 이미 띄워둔 저장을 그대로 이어받는다.
// gcTime: Infinity로 쿼리 캐시도 이미 세션 내내 안 비우기로 한 것과 같은 트레이드오프.
const autosaveEntries = new Map<string, ReviewAutosaveEntry>();

function getAutosaveEntry(key: string): ReviewAutosaveEntry {
  let entry = autosaveEntries.get(key);
  if (!entry) {
    entry = {
      dirty: false,
      timer: null,
      savingPromise: null,
      status: { kind: "clean", savedAt: new Date().toISOString() },
      statusListeners: new Set(),
    };
    autosaveEntries.set(key, entry);
  }
  return entry;
}

function setEntryStatus(entry: ReviewAutosaveEntry, status: ReviewSaveStatus) {
  entry.status = status;
  for (const listener of entry.statusListeners) {
    listener();
  }
}

// 확정·버리기로 리뷰 자체가 끝나면(다른 changeset을 잠깐 거쳐가는 것과 달리 이
// key로는 다시 편집이 들어올 일이 없다) 엔트리를 지운다 — 안 지우면 이 Map이 세션
// 내내 changeset 수만큼 무한히 쌓인다. 타이머를 직접 취소하는 건, 호출부가 먼저
// flush를 했는지에 기대지 않고 이 함수 자체가 "더 이상 예약된 저장이 없다"를
// 보장하기 위함이다(버리기처럼 flush 없이 곧장 부르는 경로가 있다 — 안 지우면
// 이미 버려진 changeset에 뒤늦게 저장 요청이 나가는 유령 저장이 된다). 단, 이미
// 네트워크로 나간 요청까지 취소하진 못한다.
export function clearAutosaveEntry(spaceId: string, changesetNumber: number) {
  const key = `${spaceId}:${changesetNumber}`;
  const entry = autosaveEntries.get(key);
  if (entry?.timer) {
    clearTimeout(entry.timer);
  }
  autosaveEntries.delete(key);
}

interface ReviewDraftContextValue {
  dispatch: (action: ReviewDraftAction) => void;
  // 타이핑 중인 필드가 "아직 초안에 안 넘긴 값이 있다"고 알려두는 자리 — 초안을
  // 바꾸는 다른 조작이 끼어들기 직전에 여기 모인 값들을 먼저 넘긴다.
  registerPendingCommit: (commit: () => void) => () => void;
  // dispatch를 거치지 않고 밀린 커밋만 넘긴다 — 확정처럼 "지금 이 순간 초안이
  // 뭔 모습인가"를 다시 읽어야 하는 지점에서, 포커스 이탈 없이도(예: 버튼 클릭이
  // blur를 안 일으키는 브라우저) 최신 값을 캐시에 반영해두기 위해 쓴다.
  flushPendingCommits: () => void;
  // 필드(useDraftField)가 자기 로컬 버퍼의 dirty 여부를 알려주는 자리 — 마운트
  // 내내 등록돼 있는 registerPendingCommit과 달리, 실제로 안 넘긴 값이 있는 동안만
  // 참으로 보고된다(hasPendingEdits가 이 값으로 판정한다).
  reportFieldDirty: (token: object, dirty: boolean) => void;
  // 디바운스를 기다리지 않고 지금 상태를 바로 저장한다. 이미 저장 중이면 그 결과를
  // 기다리고, 그 사이 또 편집이 생겼으면 한 라운드 더 돈다(ensureSaved 참고) —
  // 호출 시점의 초안이 실제로 반영될 때까지 보장한다. beforeunload·확정 직전에 쓴다.
  flushPendingSave: () => Promise<void>;
  // 포커스 복귀 재조회가 "지금 덮어써도 안전한가"를 판정하는 자리 — 리렌더를
  // 유발하지 않는 순수 조회라 이벤트 핸들러 안에서 그때그때 부른다.
  hasPendingEdits: () => boolean;
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null);

interface ReviewSaveStatusContextValue {
  saveStatus: ReviewSaveStatus;
}

const ReviewSaveStatusContext =
  createContext<ReviewSaveStatusContextValue | null>(null);

interface ReviewUndoRedoContextValue {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ReviewUndoRedoContext = createContext<ReviewUndoRedoContextValue | null>(
  null,
);

interface ReviewDraftProviderProps {
  children: ReactNode;
}

export function ReviewDraftProvider({ children }: ReviewDraftProviderProps) {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const dispatchToDraft = useReviewDraftDispatch(spaceId, changesetNumber);
  const updateReview = useUpdateReview(spaceId, changesetNumber);
  const readDraft = useReviewDraftReader(spaceId, changesetNumber);
  const writeDraft = useReviewDraftWriter(spaceId, changesetNumber);
  // 이 리뷰(changeset) 하나에 묶인 자동 저장 상태 — Map에서 매 렌더 다시 조회해도
  // 같은 key인 동안은 항상 같은 객체를 돌려받는다(리마운트돼도 마찬가지).
  const autosaveEntry = getAutosaveEntry(`${spaceId}:${changesetNumber}`);

  // updateReview(useMutation 반환값)는 isPending이 바뀔 때마다 새 객체라, 이걸 그대로
  // useCallback 의존성에 넣으면 저장 한 번마다 안정적이어야 할 콜백들(dispatch 등)의
  // 정체성이 흔들려 그걸 구독하는 모든 필드 컴포넌트가 편집마다 다시 그려진다 — 최신
  // 값은 ref로만 읽는다(useBufferedValue의 latestRef와 같은 결).
  const updateReviewRef = useRef(updateReview);
  useEffect(function syncLatestUpdateReview() {
    updateReviewRef.current = updateReview;
  });

  const pendingCommitsRef = useRef(new Set<() => void>());
  const flushingRef = useRef(false);
  const dirtyFieldsRef = useRef(new Set<object>());

  const registerPendingCommit = useCallback((commit: () => void) => {
    const pendingCommits = pendingCommitsRef.current;
    pendingCommits.add(commit);
    return () => {
      pendingCommits.delete(commit);
    };
  }, []);

  const reportFieldDirty = useCallback((token: object, dirty: boolean) => {
    if (dirty) {
      dirtyFieldsRef.current.add(token);
    } else {
      dirtyFieldsRef.current.delete(token);
    }
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

  // ---- 자동 저장 ----
  // saveStatus는 entry(모듈 Map)에 실린 값을 구독하는 외부 스토어다 — 리마운트
  // 전 인스턴스가 띄운 저장의 성공·실패도, 그 결과가 도착한 시점에 마운트돼 있는
  // 인스턴스가 그대로 받아 보게 한다.
  const subscribeToSaveStatus = useCallback(
    (onStoreChange: () => void) => {
      autosaveEntry.statusListeners.add(onStoreChange);
      return () => {
        autosaveEntry.statusListeners.delete(onStoreChange);
      };
    },
    [autosaveEntry],
  );
  const saveStatus = useSyncExternalStore(
    subscribeToSaveStatus,
    () => autosaveEntry.status,
  );

  // autosaveEntry.dirty가 참인 동안 반복한다 — 전송 중에 또 편집이 들어오면(다시
  // 참이 됨) 그 편집은 이번 요청에 안 실렸으니 한 라운드 더 돈다. expectedVersion은
  // 매 라운드 readDraft() 시점의 캐시 값을 쓰므로, 앞 라운드가 성공해 draftVersion이
  // 갱신된 뒤라면 다음 라운드는 그 새 버전으로 자연히 이어진다.
  const runSaveLoop = useCallback(async () => {
    while (autosaveEntry.dirty) {
      const draft = readDraft();
      // 캐시에서 이 changeset의 초안 자체가 사라진 예외 상황(예: 로그아웃으로 쿼리
      // 캐시 전체가 비워짐) — dirty를 그대로 남겨둔다. 여기서 false로 지우면 "저장
      // 안 된 편집이 있었다"는 사실 자체가 흔적 없이 사라진다.
      if (!draft) {
        return;
      }
      autosaveEntry.dirty = false;
      try {
        await updateReviewRef.current.mutateAsync(
          buildUpdateReviewPayload(draft),
        );
        setEntryStatus(autosaveEntry, {
          kind: "clean",
          savedAt: new Date().toISOString(),
        });
      } catch (error) {
        // 실패한 변경은 여전히 미저장 상태로 남겨, 다음 편집이나 flushPendingSave가
        // 다시 시도하게 한다 — 조용히 유실시키지 않는다.
        autosaveEntry.dirty = true;
        setEntryStatus(autosaveEntry, classifyReviewSaveError(error));
        throw error;
      }
    }
  }, [autosaveEntry, readDraft]);

  // 동시에 두 저장 요청을 띄우면 뒤엣것의 expectedVersion이 앞엣것 성공 후엔 낡은
  // 값이 되어 스스로를 버전 충돌로 오인시킨다 — 진행 중인 라운드가 있으면 그 promise를
  // 그대로 돌려줘 새 요청을 얹지 않는다. 이 라운드가 리마운트 전 인스턴스가 띄운
  // 것이어도(같은 key라 autosaveEntry를 공유) 여기서 그대로 이어받아 기다린다.
  const ensureSaved = useCallback((): Promise<void> => {
    if (autosaveEntry.savingPromise) {
      return autosaveEntry.savingPromise;
    }
    if (!autosaveEntry.dirty) {
      return Promise.resolve();
    }
    const promise = runSaveLoop().finally(() => {
      autosaveEntry.savingPromise = null;
    });
    autosaveEntry.savingPromise = promise;
    return promise;
  }, [autosaveEntry, runSaveLoop]);

  const scheduleAutosave = useCallback(() => {
    autosaveEntry.dirty = true;
    if (autosaveEntry.timer) {
      clearTimeout(autosaveEntry.timer);
    }
    autosaveEntry.timer = setTimeout(() => {
      autosaveEntry.timer = null;
      // 타이머 콜백은 아무도 기다리지 않는다 — 실패는 이미 saveStatus로 노출되니
      // 여기서는 unhandled rejection만 막는다.
      ensureSaved().catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [autosaveEntry, ensureSaved]);

  const flushPendingSave = useCallback((): Promise<void> => {
    if (autosaveEntry.timer) {
      clearTimeout(autosaveEntry.timer);
      autosaveEntry.timer = null;
    }
    return ensureSaved();
  }, [autosaveEntry, ensureSaved]);

  const hasPendingEdits = useCallback(
    () =>
      dirtyFieldsRef.current.size > 0 ||
      autosaveEntry.dirty ||
      autosaveEntry.timer !== null ||
      // updateReviewRef.current.isPending 대신 entry의 savingPromise로 판정한다 —
      // ref는 렌더 이펙트로 한 박자 늦게 갱신돼, beforeunload처럼 flush를 부른 바로
      // 그 동기 실행 구간 안에서 "방금 띄운 요청"을 놓칠 수 있다. savingPromise는
      // ensureSaved가 요청을 띄우는 그 자리에서 동기적으로 세팅된다.
      autosaveEntry.savingPromise !== null,
    [autosaveEntry],
  );

  // ---- 실행취소 / 다시 실행 ----
  // 세션 스코프 스냅샷 스택 — 새로고침하면 사라진다(review-flow.md "새로고침 후 최신
  // 저장 상태 유지"). 액션 역연산표 대신 캐시 값 자체를 통째로 넣었다 빼는 방식이라,
  // 예외 없이 모든 액션 타입이 자동으로 실행취소 대상이 된다.
  const [undoStack, setUndoStack] = useState<ReviewDraft[]>([]);
  const [redoStack, setRedoStack] = useState<ReviewDraft[]>([]);

  const dispatch = useCallback(
    (action: ReviewDraftAction) => {
      flushPendingCommits();
      const before = readDraft();
      if (before) {
        setUndoStack((stack) => [...stack, before].slice(-MAX_UNDO_STACK_SIZE));
        setRedoStack([]); // 새 편집이 일어나면 다시 실행 기록은 의미를 잃는다(표준 관례).
      }
      scheduleAutosave();
      dispatchToDraft(action);
    },
    [flushPendingCommits, readDraft, scheduleAutosave, dispatchToDraft],
  );

  // undo/redo는 StrictMode에서 두 번 불릴 수 있는 setState updater 안에 writeDraft
  // 같은 부수효과를 두지 않는다 — 두 번째 호출이 이미 한 번 덮어쓴 캐시를 "현재값"으로
  // 잘못 읽어 redo/undo 스택에 엉뚱한 스냅샷을 쌓는 사고를 구조적으로 막기 위해, 스택
  // 조회·부수효과는 클로저 값으로 여기서 한 번만 하고 setState엔 순수한 배열 계산만 넘긴다.
  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      return;
    }
    const current = readDraft();
    if (!current) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    // draftVersion은 편집 내용이 아니라 저장 프로토콜이 매기는 값이다 — 스냅샷의
    // 버전을 그대로 되살리면, 그 사이 자동 저장이 한 번이라도 성공해 서버 버전이
    // 앞서간 경우 다음 저장이 낡은 expectedVersion을 보내 결정적으로 CONFLICT가
    // 난다. 복원은 편집 내용만 되돌리고 버전은 지금 캐시가 아는 최신 값을 유지한다.
    writeDraft({ ...previous, draftVersion: current.draftVersion });
    scheduleAutosave();
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-MAX_UNDO_STACK_SIZE));
  }, [undoStack, readDraft, writeDraft, scheduleAutosave]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      return;
    }
    const current = readDraft();
    if (!current) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    writeDraft({ ...next, draftVersion: current.draftVersion });
    scheduleAutosave();
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-MAX_UNDO_STACK_SIZE));
  }, [redoStack, readDraft, writeDraft, scheduleAutosave]);

  useEffect(
    function flushDraftOnUnload() {
      function handleBeforeUnload(event: BeforeUnloadEvent) {
        flushPendingCommits();
        // 페이지를 떠나는 순간엔 디바운스를 기다릴 여유가 없다 — 완료를 보장할 수는
        // 없지만(unload 중 네트워크 요청은 브라우저가 취소할 수 있다) 최소한 시도는 한다.
        flushPendingSave().catch(() => {});
        // 방금 띄운 저장이 실제로 끝났는지는 알 길이 없다 — 저장할 게 남아있었다면
        // 브라우저 기본 이탈 확인창을 띄워, 응답을 기다릴지는 사용자가 고르게 한다.
        if (hasPendingEdits()) {
          event.preventDefault();
          event.returnValue = "";
        }
      }
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    },
    [flushPendingCommits, flushPendingSave, hasPendingEdits],
  );

  useEffect(
    function flushDraftOnUnmount() {
      return function flushOnUnmount() {
        // SPA 라우팅으로 화면을 벗어나는 경우 beforeunload는 뜨지 않는다 — 아직 디바운스
        // 대기 중인 편집이 있으면 언마운트 시점에 마지막으로 한 번 더 시도한다(타이머
        // 취소는 flushPendingSave가 이미 한다). 같은 changeset으로 되돌아오면 새
        // 인스턴스가 이 promise를(autosaveEntry가 공유되므로) 그대로 이어받는다.
        flushPendingSave().catch(() => {});
      };
    },
    [flushPendingSave],
  );

  const draftContext = useMemo(
    () => ({
      dispatch,
      registerPendingCommit,
      flushPendingCommits,
      reportFieldDirty,
      flushPendingSave,
      hasPendingEdits,
    }),
    [
      dispatch,
      registerPendingCommit,
      flushPendingCommits,
      reportFieldDirty,
      flushPendingSave,
      hasPendingEdits,
    ],
  );
  const saveStatusContext = useMemo(() => ({ saveStatus }), [saveStatus]);
  const undoRedoContext = useMemo(
    () => ({
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    }),
    [undo, redo, undoStack.length, redoStack.length],
  );

  return (
    <ReviewDraftContext value={draftContext}>
      <ReviewSaveStatusContext value={saveStatusContext}>
        <ReviewUndoRedoContext value={undoRedoContext}>
          {children}
        </ReviewUndoRedoContext>
      </ReviewSaveStatusContext>
    </ReviewDraftContext>
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

export function useReviewSaveStatusContext(): ReviewSaveStatusContextValue {
  const context = useContext(ReviewSaveStatusContext);
  if (!context) {
    throw new Error(
      "useReviewSaveStatusContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}

export function useReviewUndoRedoContext(): ReviewUndoRedoContextValue {
  const context = useContext(ReviewUndoRedoContext);
  if (!context) {
    throw new Error(
      "useReviewUndoRedoContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}
